/**
 * Oracle Commerce Cloud (OCC) API Client
 *
 * Wraps HTTP calls to the OCC Admin REST API for usage-data extraction.
 * OCC base URL pattern: https://{host}/ccadmin/v1
 *
 * Auth: Bearer token obtained via /ccadmin/v1/login (appKey).
 * Usage metrics are fetched from /ccadmin/v1/reports/usageMetrics.
 */

export interface OccUsageRecord {
  /** OCC-internal unique ID for this usage event */
  id: string;
  accountId: string;
  metricType: string;
  quantity: number;
  periodStart: string; // ISO-8601
  periodEnd: string;   // ISO-8601
}

export interface OccUsageResponse {
  items: OccUsageRecord[];
  total: number;
  offset: number;
  limit: number;
}

export class OccApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'OccApiError';
  }
}

interface OccClientConfig {
  host: string;     // e.g. "mysite.admin.oraclecloud.com"
  appKey: string;   // OCC application key
}

/** Authenticate and return a Bearer token. OCC tokens expire after ~60 minutes. */
async function getAccessToken(config: OccClientConfig): Promise<string> {
  const url = `https://${config.host}/ccadmin/v1/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', appKey: config.appKey }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OccApiError(res.status, `OCC auth failed ${res.status}: ${res.statusText}`, body);
  }

  // OCC returns { access_token: "...", token_type: "bearer", expires_in: 3600 }
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) {
    throw new OccApiError(200, 'OCC auth response missing access_token', json);
  }
  return json.access_token;
}

interface OccHeaders {
  Authorization: string;
  Accept: string;
  'x-ccasset-language': string;
}

function buildHeaders(token: string): OccHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'x-ccasset-language': 'en',
  };
}

/**
 * Fetch usage metrics from OCC.
 *
 * OCC paginates via offset/limit. We request `limit` items starting from `offset`.
 * Callers should loop until `items.length < limit` or `offset + limit >= total`.
 */
export async function fetchUsageMetrics(
  config: OccClientConfig,
  params: {
    metricTypes?: string[];
    periodStart?: string;
    periodEnd?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<OccUsageResponse> {
  const token = await getAccessToken(config);
  const headers = buildHeaders(token);

  const query = new URLSearchParams();
  query.set('offset', String(params.offset ?? 0));
  query.set('limit', String(params.limit ?? 50));
  if (params.metricTypes?.length) {
    query.set('metricTypes', params.metricTypes.join(','));
  }
  if (params.periodStart) query.set('startDate', params.periodStart);
  if (params.periodEnd) query.set('endDate', params.periodEnd);

  const url = `https://${config.host}/ccadmin/v1/reports/usageMetrics?${query.toString()}`;
  const res = await fetch(url, { method: 'GET', headers });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OccApiError(res.status, `OCC API error ${res.status}: ${res.statusText}`, body);
  }

  const json = await res.json() as {
    items?: Array<{
      id?: string;
      accountId?: string;
      metricType?: string;
      quantity?: number;
      periodStart?: string;
      periodEnd?: string;
    }>;
    total?: number;
    offset?: number;
    limit?: number;
  };

  return {
    items: (json.items ?? []).map((item) => ({
      id: String(item.id ?? ''),
      accountId: String(item.accountId ?? ''),
      metricType: String(item.metricType ?? ''),
      quantity: Number(item.quantity ?? 0),
      periodStart: item.periodStart ?? '',
      periodEnd: item.periodEnd ?? '',
    })),
    total: Number(json.total ?? 0),
    offset: Number(json.offset ?? 0),
    limit: Number(json.limit ?? 50),
  };
}

/**
 * Fetch ALL usage metrics across pages for the given params.
 * Makes multiple requests until all pages are consumed.
 */
export async function fetchAllUsageMetrics(
  config: OccClientConfig,
  params: {
    metricTypes?: string[];
    periodStart?: string;
    periodEnd?: string;
  } = {},
): Promise<OccUsageRecord[]> {
  const pageSize = 100;
  const records: OccUsageRecord[] = [];
  let offset = 0;

  for (;;) {
    const page = await fetchUsageMetrics(config, { ...params, offset, limit: pageSize });
    records.push(...page.items);
    if (page.items.length < pageSize) break;
    offset += pageSize;
    if (offset >= page.total) break;
  }

  return records;
}
