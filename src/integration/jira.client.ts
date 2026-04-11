/**
 * JIRA Cloud REST API v3 Client
 *
 * Auth: Basic base64(email:apiToken) — standard JIRA Cloud Basic auth.
 * Ref: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
 *
 * Requires Node.js 18+ for the global `fetch` API (this project targets Node 22+
 * per @types/node ^22 in package.json — no polyfill needed).
 *
 * Rate limiting: Exponential backoff on HTTP 429 — 3 retries, delays 1000ms / 2000ms / 4000ms.
 */

export interface JiraMyself {
  accountId: string;
  displayName: string;
  emailAddress: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  projectTypeKey?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status: {
      name: string;
      statusCategory?: { key: string };
    };
    project: { id: string; key: string; name: string };
    assignee?: { accountId: string; displayName: string } | null;
  };
}

export interface JiraWorklog {
  id: string;
  issueId: string;
  author: { accountId: string; displayName: string };
  created: string;
  started: string;
  timeSpentSeconds: number;
  comment?: unknown;
}

export interface JiraProjectStatus {
  id: string;
  name: string;
  statusCategory?: { key: string; name: string };
}

export class JiraApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

function authHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
}

const RETRY_DELAYS = [1000, 2000, 4000];

async function jiraFetch<T>(url: string, email: string, apiToken: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader(email, apiToken),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 429 && attempt < RETRY_DELAYS.length) {
      lastError = new JiraApiError(429, 'JIRA rate limit exceeded, retrying...');
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new JiraApiError(res.status, `JIRA API error ${res.status}: ${res.statusText}`, body);
    }

    return res.json() as Promise<T>;
  }

  throw lastError ?? new JiraApiError(429, 'JIRA rate limit exceeded after retries');
}

/**
 * GET /rest/api/3/myself
 */
export async function getMyself(host: string, email: string, apiToken: string): Promise<JiraMyself> {
  const url = `https://${host}/rest/api/3/myself`;
  return jiraFetch<JiraMyself>(url, email, apiToken);
}

/**
 * GET /rest/api/3/project/search
 * NOTE: Pagination params startAt/maxResults — verified for /search endpoints.
 * Confirm these apply to /project/search at runtime.
 */
export async function searchProjects(
  host: string,
  email: string,
  apiToken: string,
  startAt = 0,
  maxResults = 50,
): Promise<{ values: JiraProject[]; total: number; startAt: number; maxResults: number; isLast: boolean }> {
  const url = `https://${host}/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`;
  return jiraFetch<{ values: JiraProject[]; total: number; startAt: number; maxResults: number; isLast: boolean }>(
    url,
    email,
    apiToken,
  );
}

/**
 * GET /rest/api/3/search (JQL)
 */
export async function searchIssues(
  host: string,
  email: string,
  apiToken: string,
  jql: string,
  startAt = 0,
  maxResults = 50,
): Promise<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }> {
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields: 'summary,status,project,assignee,description',
  });
  const url = `https://${host}/rest/api/3/search?${params.toString()}`;
  return jiraFetch<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }>(
    url,
    email,
    apiToken,
  );
}

/**
 * GET /rest/api/3/issue/{issueIdOrKey}/worklog
 */
export async function getIssueWorklogs(
  host: string,
  email: string,
  apiToken: string,
  issueIdOrKey: string,
): Promise<{ worklogs: JiraWorklog[]; total: number }> {
  const url = `https://${host}/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`;
  return jiraFetch<{ worklogs: JiraWorklog[]; total: number }>(url, email, apiToken);
}

/**
 * GET /rest/api/3/project/{projectKey}/statuses
 * NOTE: The statusCategory field existence in the response is unverified — confirm at runtime.
 */
export async function getProjectStatuses(
  host: string,
  email: string,
  apiToken: string,
  projectKey: string,
): Promise<JiraProjectStatus[]> {
  const url = `https://${host}/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`;
  // Response is an array of issue types each containing statuses; flatten to unique statuses
  type StatusesResponse = Array<{ statuses: JiraProjectStatus[] }>;
  const data = await jiraFetch<StatusesResponse>(url, email, apiToken);
  const seen = new Set<string>();
  const result: JiraProjectStatus[] = [];
  for (const issueType of data) {
    for (const status of issueType.statuses ?? []) {
      if (!seen.has(status.id)) {
        seen.add(status.id);
        result.push(status);
      }
    }
  }
  return result;
}
