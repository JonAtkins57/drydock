/**
 * SAP Concur REST API v3 Client
 *
 * Auth: OAuth2 client_credentials flow — POST {baseUrl}/oauth2/v0/token
 * Ref: https://developer.concur.com/api-reference/authentication/apidoc.html
 *
 * Expense reports: GET {baseUrl}/api/v3.0/expense/reports
 * Expense entries: GET {baseUrl}/api/v3.0/expense/entries
 *
 * Credentials are never logged.
 * baseUrl must start with https:// — enforced in concur.service.ts before client calls.
 */

export interface ConcurExpenseReport {
  ID: string;
  Name: string;
  SubmitDate: string; // ISO datetime e.g. "2024-01-15T00:00:00"
  Total: number;
  CurrencyCode: string;
  ApprovalStatusCode: string;
  OwnerLoginID?: string;
  OwnerName?: string;
}

export interface ConcurExpenseEntry {
  ID: string;
  ReportID: string;
  ExpenseTypeCode: string;
  ExpenseTypeName?: string;
  TransactionAmount: number;
  TransactionCurrencyCode: string;
  Description?: string;
}

export class ConcurApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'ConcurApiError';
  }
}

/**
 * Fetch an OAuth2 access token using client_credentials grant.
 * Returns the access_token string.
 */
export async function fetchToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const url = `${baseUrl}/oauth2/v0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ConcurApiError(
      res.status,
      `Concur token fetch failed (HTTP ${res.status}): ${res.statusText}`,
      text,
    );
  }

  const data = await res.json() as { access_token?: string };
  if (!data.access_token) {
    throw new ConcurApiError(200, 'Concur token response missing access_token field');
  }

  return data.access_token;
}

/**
 * Fetch a page of approved expense reports.
 * offset is 0-based.
 * Returns { items, nextPage } — nextPage is the URL of the next page or null.
 */
export async function fetchExpenseReports(
  baseUrl: string,
  token: string,
  offset: number,
): Promise<{ items: ConcurExpenseReport[]; nextPage: string | null }> {
  const params = new URLSearchParams({
    approvalStatusCode: 'A_APPR',
    limit: '100',
    offset: String(offset),
  });
  const url = `${baseUrl}/api/v3.0/expense/reports?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ConcurApiError(
      res.status,
      `Concur expense reports fetch failed (HTTP ${res.status}): ${res.statusText}`,
      text,
    );
  }

  const data = await res.json() as { Items?: ConcurExpenseReport[]; NextPage?: string | null };
  return {
    items: data.Items ?? [],
    nextPage: data.NextPage ?? null,
  };
}

/**
 * Fetch all expense entries for a given report.
 */
export async function fetchExpenseEntries(
  baseUrl: string,
  token: string,
  reportId: string,
): Promise<ConcurExpenseEntry[]> {
  const params = new URLSearchParams({ reportId });
  const url = `${baseUrl}/api/v3.0/expense/entries?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ConcurApiError(
      res.status,
      `Concur expense entries fetch failed (HTTP ${res.status}): ${res.statusText}`,
      text,
    );
  }

  const data = await res.json() as { Items?: ConcurExpenseEntry[] };
  return data.Items ?? [];
}
