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

export interface AgingBucket {
  count: number;
  totalAmount: number;
  totalOutstanding: number;
}

export interface StatementInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}

export interface StatementResponse {
  customer_id: string;
  customer_name: string;
  statement_date: string;
  from: string;
  to: string;
  open_invoices: StatementInvoice[];
  credit_memos: unknown[];
  unapplied_payments: unknown[];
  aging_summary: {
    current: AgingBucket;
    '1_30': AgingBucket;
    '31_60': AgingBucket;
    '61_90': AgingBucket;
    '90plus': AgingBucket;
  };
  total_outstanding: number;
  truncated: boolean;
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
  employees: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/employees?page=${page}&pageSize=${pageSize}`
    ),
  createEmployee: (data: unknown) => api('/employees', { method: 'POST', body: data }),
  items: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/items?page=${page}&pageSize=${pageSize}`
    ),
  createItem: (data: unknown) => api('/items', { method: 'POST', body: data }),
  locations: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/locations?page=${page}&pageSize=${pageSize}`
    ),
  createLocation: (data: unknown) => api('/locations', { method: 'POST', body: data }),
  projects: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/projects?page=${page}&pageSize=${pageSize}`
    ),
  createProject: (data: unknown) => api('/projects', { method: 'POST', body: data }),
  customFields: (page = 1, pageSize = 100) =>
    api<{ data: unknown[]; total: number; page: number; pageSize: number }>(
      `/custom-fields?page=${page}&pageSize=${pageSize}`
    ),
  createCustomField: (data: unknown) => api('/custom-fields', { method: 'POST', body: data }),
  workflows: (entityType: string) => api<unknown>(`/workflows/${entityType}`),

  // P2P: Requisitions
  requisitions: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/requisitions?page=${page}&pageSize=${pageSize}`
    ),
  createRequisition: (data: unknown) => api('/requisitions', { method: 'POST', body: data }),
  requisitionAction: (id: string, action: string) =>
    api(`/requisitions/${id}/actions/${action}`, { method: 'POST' }),

  // P2P: Purchase Orders
  purchaseOrders: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/purchase-orders?page=${page}&pageSize=${pageSize}`
    ),
  createPO: (data: unknown) => api('/purchase-orders', { method: 'POST', body: data }),
  poAction: (id: string, action: string) =>
    api(`/purchase-orders/${id}/actions/${action}`, { method: 'POST' }),
  receivePO: (id: string, data: unknown) =>
    api(`/purchase-orders/${id}/actions/receive`, { method: 'POST', body: data }),

  // AP Processing
  apInvoices: (page = 1, pageSize = 25, status?: string) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/ap-invoices?page=${page}&pageSize=${pageSize}${status ? `&filter={"status":"${status}"}` : ''}`
    ),
  apInvoiceQueue: () => api<unknown>('/ap-invoices/queue'),
  apInvoiceDetail: (id: string) => api<unknown>(`/ap-invoices/${id}`),
  apInvoiceAction: (id: string, action: string) =>
    api(`/ap-invoices/${id}/actions/${action}`, { method: 'POST' }),
  apApplyCoding: (id: string, data: unknown) =>
    api(`/ap-invoices/${id}/actions/code`, { method: 'POST', body: data }),

  // Goods Receipts
  goodsReceipts: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/goods-receipts?page=${page}&pageSize=${pageSize}`
    ),

  // Q2C: Quotes
  quotes: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/quotes?page=${page}&pageSize=${pageSize}`
    ),
  createQuote: (data: unknown) => api('/quotes', { method: 'POST', body: data }),
  quoteAction: (id: string, action: string) =>
    api(`/quotes/${id}/actions/${action}`, { method: 'POST' }),

  // Q2C: Sales Orders
  orders: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/orders?page=${page}&pageSize=${pageSize}`
    ),
  createOrder: (data: unknown) => api('/orders', { method: 'POST', body: data }),
  orderAction: (id: string, action: string) =>
    api(`/orders/${id}/actions/${action}`, { method: 'POST' }),

  // Q2C: Invoices
  invoices: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/invoices?page=${page}&pageSize=${pageSize}`
    ),
  createInvoice: (data: unknown) => api('/invoices', { method: 'POST', body: data }),
  invoiceAction: (id: string, action: string, body?: unknown) =>
    api(`/invoices/${id}/actions/${action}`, { method: 'POST', body }),
  arAging: () => api<unknown>('/reports/ar-aging'),

  // Q2C: Customer Statements
  customerStatement: (id: string, from: string, to: string) =>
    api<StatementResponse>(`/customers/${id}/statement?from=${from}&to=${to}`),
  sendStatement: (id: string, toEmail?: string) =>
    api<{ messageId: string; sentTo: string }>(`/customers/${id}/actions/send-statement`, {
      method: 'POST',
      body: toEmail !== undefined ? { toEmail } : {},
    }),

  // Q2C: Billing Plans
  billingPlans: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/billing-plans?page=${page}&pageSize=${pageSize}`
    ),
  createBillingPlan: (data: unknown) => api('/billing-plans', { method: 'POST', body: data }),
};
