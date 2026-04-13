/**
 * Harvest API v2 Client
 *
 * Auth: Bearer token + Harvest-Account-Id header.
 * Ref: https://help.getharvest.com/api-v2/
 *
 * Rate limiting: Exponential backoff on HTTP 429, respecting Retry-After header.
 * Pagination: page-based, `next_page` field in response.
 */

export interface HarvestUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isContractor: boolean;
  weeklyCapacity: number;
  defaultHourlyRate: number | null;
  costRate: number | null;
}

export interface HarvestProject {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  isBillable: boolean;
  budget: number | null;
  budgetBy: string;
  clientId: number | null;
  clientName: string;
}

export interface HarvestTimeEntry {
  id: number;
  spentDate: string;        // YYYY-MM-DD
  hours: number;
  roundedHours: number;
  userId: number;
  userName: string;
  userEmail: string;
  projectId: number;
  projectName: string;
  projectCode: string;
  taskId: number | null;
  taskName: string;
  clientId: number | null;
  clientName: string;
  billable: boolean;
  billableRate: number;
  costRate: number;
  isBilled: boolean;
  isLocked: boolean;
  notes: string;
  externalRefId: string;
  externalRefUrl: string;
  startedTime: string | null;
  endedTime: string | null;
}

export class HarvestApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'HarvestApiError';
  }
}

const BASE_URL = 'https://api.harvestapp.com/v2';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const PER_PAGE = 100; // Harvest max

function authHeaders(accessToken: string, accountId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Harvest-Account-Id': accountId,
    'User-Agent': 'DryDock ERP (drydock@thrasoz.com)',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function harvestFetch<T>(
  path: string,
  accessToken: string,
  accountId: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: authHeaders(accessToken, accountId),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? (RETRY_DELAYS[attempt] ?? 4000) / 1000);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      lastError = new HarvestApiError(429, 'Harvest rate limit exceeded, retrying...');
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HarvestApiError(res.status, `Harvest API error ${res.status}: ${res.statusText}`, body);
    }

    return res.json() as Promise<T>;
  }

  throw lastError ?? new HarvestApiError(429, 'Harvest rate limit exceeded after retries');
}

// ── Users ─────────────────────────────────────────────────────────

export async function fetchUsers(
  accessToken: string,
  accountId: string,
): Promise<HarvestUser[]> {
  const users: HarvestUser[] = [];
  let page = 1;

  while (true) {
    const data = await harvestFetch<{ users: RawUser[]; next_page: number | null }>(
      '/users',
      accessToken,
      accountId,
      { is_active: 'true', page, per_page: PER_PAGE },
    );

    for (const u of data.users ?? []) {
      users.push({
        id: u.id,
        email: (u.email ?? '').toLowerCase(),
        firstName: u.first_name ?? '',
        lastName: u.last_name ?? '',
        isActive: u.is_active ?? true,
        isContractor: u.is_contractor ?? false,
        weeklyCapacity: u.weekly_capacity ?? 0,
        defaultHourlyRate: u.default_hourly_rate ?? null,
        costRate: u.cost_rate ?? null,
      });
    }

    if (!data.next_page) break;
    page = data.next_page;
  }

  return users;
}

// ── Projects ──────────────────────────────────────────────────────

export async function fetchProjects(
  accessToken: string,
  accountId: string,
): Promise<HarvestProject[]> {
  const projects: HarvestProject[] = [];
  let page = 1;

  while (true) {
    const data = await harvestFetch<{ projects: RawProject[]; next_page: number | null }>(
      '/projects',
      accessToken,
      accountId,
      { page, per_page: PER_PAGE },
    );

    for (const p of data.projects ?? []) {
      projects.push({
        id: p.id,
        name: p.name ?? '',
        code: p.code ?? '',
        isActive: p.is_active ?? true,
        isBillable: p.is_billable ?? false,
        budget: p.budget ?? null,
        budgetBy: p.budget_by ?? '',
        clientId: p.client?.id ?? null,
        clientName: p.client?.name ?? '',
      });
    }

    if (!data.next_page) break;
    page = data.next_page;
  }

  return projects;
}

// ── Time Entries ──────────────────────────────────────────────────

/**
 * Fetch time entries in date range, yielding batches of entries.
 * @param since - ISO date YYYY-MM-DD
 * @param until - ISO date YYYY-MM-DD (default: today)
 * @param userEmailCache - map of harvest userId → email (pre-populated from fetchUsers)
 */
export async function* fetchTimeEntries(
  accessToken: string,
  accountId: string,
  since: string,
  until: string,
  userEmailCache: Map<number, string> = new Map(),
): AsyncGenerator<HarvestTimeEntry[]> {
  let page = 1;

  while (true) {
    const data = await harvestFetch<{ time_entries: RawTimeEntry[]; next_page: number | null }>(
      '/time_entries',
      accessToken,
      accountId,
      { from: since, to: until, page, per_page: PER_PAGE },
    );

    const entries = data.time_entries ?? [];
    if (entries.length === 0) break;

    const batch: HarvestTimeEntry[] = entries.map((e) => {
      const email = userEmailCache.get(e.user?.id ?? 0) ?? '';

      return {
        id: e.id,
        spentDate: e.spent_date ?? '',
        hours: Number(e.hours ?? 0),
        roundedHours: Number(e.rounded_hours ?? 0),
        userId: e.user?.id ?? 0,
        userName: e.user?.name ?? '',
        userEmail: email,
        projectId: e.project?.id ?? 0,
        projectName: e.project?.name ?? '',
        projectCode: e.project?.code ?? '',
        taskId: e.task?.id ?? null,
        taskName: e.task?.name ?? '',
        clientId: e.client?.id ?? null,
        clientName: e.client?.name ?? '',
        billable: e.billable ?? false,
        billableRate: Number(e.billable_rate ?? 0),
        costRate: Number(e.cost_rate ?? 0),
        isBilled: e.is_billed ?? false,
        isLocked: e.is_locked ?? false,
        notes: (e.notes ?? '').slice(0, 2000),
        externalRefId: e.external_reference?.id ?? '',
        externalRefUrl: (e.external_reference?.permalink ?? '').slice(0, 500),
        startedTime: e.started_time ?? null,
        endedTime: e.ended_time ?? null,
      };
    });

    yield batch;

    if (!data.next_page) break;
    page = data.next_page;
  }
}

// ── Raw API types (Harvest v2 snake_case) ─────────────────────────

interface RawUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_contractor: boolean;
  weekly_capacity: number;
  default_hourly_rate: number | null;
  cost_rate: number | null;
}

interface RawProject {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  is_billable: boolean;
  budget: number | null;
  budget_by: string;
  client: { id: number; name: string } | null;
}

interface RawTimeEntry {
  id: number;
  spent_date: string;
  hours: number;
  rounded_hours: number;
  user: { id: number; name: string } | null;
  project: { id: number; name: string; code: string } | null;
  task: { id: number; name: string } | null;
  client: { id: number; name: string } | null;
  billable: boolean;
  billable_rate: number | null;
  cost_rate: number | null;
  is_billed: boolean;
  is_locked: boolean;
  notes: string | null;
  external_reference: { id: string; permalink: string } | null;
  started_time: string | null;
  ended_time: string | null;
}
