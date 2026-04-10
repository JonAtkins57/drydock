const BASE = '/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = opts.token ?? localStorage.getItem('drydock_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.detail ?? error.message ?? 'Request failed', error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

export const endpoints = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; refreshToken: string; expiresIn: number }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => api<{ id: string; tenantId: string; email: string; firstName: string; lastName: string; permissions: string[] }>('/auth/me'),
  customers: (page = 1, pageSize = 25) => api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/customers?page=${page}&pageSize=${pageSize}`),
  vendors: (page = 1, pageSize = 25) => api<{ data: unknown[]; meta: { total: number } }>(`/vendors?page=${page}&pageSize=${pageSize}`),
  accounts: () => api<{ data: unknown[] }>('/accounts'),
  periods: () => api<unknown[]>('/accounting-periods'),
  health: () => api<{ status: string; version: string }>('/health'),
  leads: (page = 1, pageSize = 25, status?: string) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/leads?page=${page}&pageSize=${pageSize}${status ? `&filter={"status":"${status}"}` : ''}`
    ),
  createLead: (data: unknown) => api('/leads', { method: 'POST', body: data }),
  convertLead: (id: string, data: unknown) => api(`/leads/${id}/convert`, { method: 'POST', body: data }),
  opportunities: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/opportunities?page=${page}&pageSize=${pageSize}`
    ),
  pipeline: () => api<unknown>('/opportunities/pipeline'),
  createOpportunity: (data: unknown) => api('/opportunities', { method: 'POST', body: data }),
  activities: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/activities?page=${page}&pageSize=${pageSize}`
    ),
  myActivities: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/activities/mine?page=${page}&pageSize=${pageSize}`
    ),
  createActivity: (data: unknown) => api('/activities', { method: 'POST', body: data }),
  completeActivity: (id: string) => api(`/activities/${id}/complete`, { method: 'POST' }),
  journalEntries: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/journal-entries?page=${page}&pageSize=${pageSize}`
    ),
  createJournalEntry: (data: unknown) => api('/journal-entries', { method: 'POST', body: data }),
  journalAction: (id: string, action: string) =>
    api(`/journal-entries/${id}/actions/${action}`, { method: 'POST' }),
  trialBalance: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<unknown>(`/reports/trial-balance${qs}`);
  },
  createVendor: (data: unknown) => api('/vendors', { method: 'POST', body: data }),
  createAccount: (data: unknown) => api('/accounts', { method: 'POST', body: data }),
};
