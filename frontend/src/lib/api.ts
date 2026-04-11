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
  incomeStatement: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<unknown>(`/reports/income-statement${qs}`);
  },
  balanceSheet: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<unknown>(`/reports/balance-sheet${qs}`);
  },
  balanceSheetRollforward: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api<unknown>(`/reports/balance-sheet-rollforward${qs}`);
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

  // AP Auto-Coding (ML suggestions)
  apAutocodingSuggest: (apInvoiceLineId: string) =>
    api<{ suggestionId: string; suggestions: { accountId: string; accountName: string; confidence: number; rank: number }[] }>(
      '/ap/auto-coding/suggestions',
      { method: 'POST', body: { apInvoiceLineId } }
    ),
  apAutocodingFeedback: (data: { suggestionId: string; accepted: boolean; chosenAccountId: string; acceptedRank?: number | null }) =>
    api('/ap/auto-coding/feedback', { method: 'POST', body: data }),
  apAutocodingMetrics: () =>
    api<{
      totalSuggestions: number;
      acceptedCount: number;
      rejectedCount: number;
      acceptanceRate: number;
      topAccounts: { accountId: string; accountName: string; frequency: number; acceptanceRate: number }[];
    }>('/ap/auto-coding/metrics'),

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

  // Q2C: Credit Memos
  creditMemos: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/credit-memos?page=${page}&pageSize=${pageSize}`
    ),
  createCreditMemo: (data: unknown) => api('/credit-memos', { method: 'POST', body: data }),
  creditMemoAction: (id: string, action: string, body?: unknown) =>
    api(`/credit-memos/${id}/actions/${action}`, { method: 'POST', body }),

  // Q2C: Revenue Recognition
  revRecContracts: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/rev-rec/contracts?page=${page}&pageSize=${pageSize}`
    ),
  revRecObligations: (page = 1, pageSize = 25, contractId?: string) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/rev-rec/obligations?page=${page}&pageSize=${pageSize}${contractId ? `&contractId=${contractId}` : ''}`
    ),
  revRecSchedules: (page = 1, pageSize = 25, obligationId?: string) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/rev-rec/schedules?page=${page}&pageSize=${pageSize}${obligationId ? `&obligationId=${obligationId}` : ''}`
    ),
  recognizeRevenue: (contractId: string, body: unknown) =>
    api(`/rev-rec/contracts/${contractId}/recognize`, { method: 'POST', body }),

  // Q2C: Billing Plans
  billingPlans: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/billing-plans?page=${page}&pageSize=${pageSize}`
    ),
  createBillingPlan: (data: unknown) => api('/billing-plans', { method: 'POST', body: data }),

  // Lease Accounting (ASC 842)
  leases: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/leases?page=${page}&pageSize=${pageSize}`
    ),
  createLease: (data: unknown) => api('/leases', { method: 'POST', body: data }),

  // Fixed Assets
  assets: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/assets?page=${page}&pageSize=${pageSize}`
    ),
  createAsset: (data: unknown) => api('/assets', { method: 'POST', body: data }),
  getAsset: (id: string) => api<unknown>(`/assets/${id}`),
  updateAsset: (id: string, data: unknown) => api(`/assets/${id}`, { method: 'PATCH', body: data }),
  depreciateAsset: (id: string, data: unknown) => api(`/assets/${id}/actions/depreciate`, { method: 'POST', body: data }),
  disposeAsset: (id: string, data: unknown) => api(`/assets/${id}/actions/dispose`, { method: 'POST', body: data }),
  assetBooks: (id: string, params?: { bookType?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.bookType) qs.set('bookType', params.bookType);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/assets/${id}/books${q ? '?' + q : ''}`
    );
  },
  assetRollForward: (from: string, to: string, bookType?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (bookType) qs.set('bookType', bookType);
    return api<{ data: unknown[]; meta: { from: string; to: string; bookType: string | null } }>(
      `/assets/roll-forward?${qs.toString()}`
    );
  },

  // Work Orders
  workOrders: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/work-orders?page=${page}&pageSize=${pageSize}`
    ),
  createWorkOrder: (data: unknown) => api('/work-orders', { method: 'POST', body: data }),
  updateWorkOrder: (id: string, data: unknown) => api(`/work-orders/${id}`, { method: 'PATCH', body: data }),
  addWorkOrderPart: (id: string, data: unknown) => api(`/work-orders/${id}/parts`, { method: 'POST', body: data }),
  addWorkOrderTimeLog: (id: string, data: unknown) => api(`/work-orders/${id}/time-logs`, { method: 'POST', body: data }),

  // Budgets
  budgets: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/budgets?page=${page}&pageSize=${pageSize}`
    ),
  createBudget: (data: unknown) => api('/budgets', { method: 'POST', body: data }),
  getBudget: (id: string) => api(`/budgets/${id}`),
  addBudgetLine: (id: string, data: unknown) => api(`/budgets/${id}/lines`, { method: 'POST', body: data }),
  getBudgetVariance: (id: string) => api(`/budgets/${id}/variance`),

  // Cash Forecasts
  cashForecastRolling: () => api<{ data: unknown[] }>('/cash-forecasts/rolling'),
  cashForecastScenarios: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/cash-forecasts?page=${page}&pageSize=${pageSize}`
    ),
  cashForecastScenario: (id: string) => api<unknown>(`/cash-forecasts/${id}`),
  createCashForecastScenario: (data: unknown) => api('/cash-forecasts', { method: 'POST', body: data }),
  bankAccounts: () => api<{ data: unknown[] }>('/cash-forecasts/bank-accounts'),
  createBankAccount: (data: unknown) => api('/cash-forecasts/bank-accounts', { method: 'POST', body: data }),
  bankAccountBalances: (id: string) =>
    api<{ data: unknown[] }>(`/cash-forecasts/bank-accounts/${id}/balances`),
  recordBankBalance: (id: string, data: unknown) =>
    api(`/cash-forecasts/bank-accounts/${id}/balances`, { method: 'POST', body: data }),

  // Forecasts
  forecasts: (page = 1, pageSize = 50, params?: { fiscalYear?: number; budgetId?: string }) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (params?.fiscalYear) qs.set('fiscalYear', String(params.fiscalYear));
    if (params?.budgetId) qs.set('budgetId', params.budgetId);
    return api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/forecasts?${qs.toString()}`
    );
  },
  createForecast: (data: unknown) => api('/forecasts', { method: 'POST', body: data }),

  // Project Management
  projectsMgmt: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/projects-mgmt?page=${page}&pageSize=${pageSize}`
    ),
  createProjectMgmt: (data: unknown) => api('/projects-mgmt', { method: 'POST', body: data }),
  // KPI Dashboards
  kpis: (from: string, to: string) =>
    api<{ data: unknown[]; from: string; to: string }>(`/kpis?from=${from}&to=${to}`),
  dashboards: () => api<{ data: unknown[] }>('/dashboards'),
  createDashboard: (data: unknown) => api('/dashboards', { method: 'POST', body: data }),
  getDashboard: (id: string) => api(`/dashboards/${id}`),
  updateDashboard: (id: string, data: unknown) => api(`/dashboards/${id}`, { method: 'PUT', body: data }),
  deleteDashboard: (id: string) => api(`/dashboards/${id}`, { method: 'DELETE' }),
  // OCC Usage-Based Billing
  occRuns: (configId: string, limit = 50) =>
    api<{ data: unknown[]; total: number }>(`/integrations/occ/runs?configId=${encodeURIComponent(configId)}&limit=${limit}`),
  occPullAndInvoice: (configId: string, periodStart: string, periodEnd: string) =>
    api<{ runId: string; invoiceId: string | null }>('/integrations/occ/pull-and-invoice', {
      method: 'POST',
      body: { configId, periodStart, periodEnd },
    }),
  occRateCards: () => api<{ data: unknown[] }>('/integrations/occ/rate-cards'),
  occCreateRateCard: (data: unknown) => api('/integrations/occ/rate-cards', { method: 'POST', body: data }),
  occUpdateRateCard: (id: string, data: unknown) => api(`/integrations/occ/rate-cards/${id}`, { method: 'PATCH', body: data }),
  occDeleteRateCard: (id: string) => api(`/integrations/occ/rate-cards/${id}`, { method: 'DELETE' }),
  // Pricing / Rate Cards
  rateCards: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/pricing/rate-cards?page=${page}&pageSize=${pageSize}`),
  createRateCard: (data: unknown) => api('/pricing/rate-cards', { method: 'POST', body: data }),
  getRateCard: (id: string) => api<unknown>(`/pricing/rate-cards/${id}`),
  addRateCardTier: (id: string, data: unknown) => api(`/pricing/rate-cards/${id}/tiers`, { method: 'POST', body: data }),
  deleteRateCard: (id: string) => api(`/pricing/rate-cards/${id}`, { method: 'DELETE' }),
  pricingOverrides: (page = 1, pageSize = 25) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/pricing/overrides?page=${page}&pageSize=${pageSize}`),
  createPricingOverride: (data: unknown) => api('/pricing/overrides', { method: 'POST', body: data }),
  updatePricingOverride: (id: string, data: unknown) => api(`/pricing/overrides/${id}`, { method: 'PATCH', body: data }),
  lookupPrice: (customerId: string, rateCardId: string, quantity: number, effectiveDate: string) =>
    api<{ source: 'override' | 'tier'; unitPriceCents: number; currency: string }>(
      `/pricing/rate-cards/lookup?customerId=${encodeURIComponent(customerId)}&rateCardId=${encodeURIComponent(rateCardId)}&quantity=${quantity}&effectiveDate=${encodeURIComponent(effectiveDate)}`
    ),

  // Attachments
  listAttachments: (entityType: string, entityId: string): Promise<AttachmentRow[]> => {
    const token = localStorage.getItem('drydock_token');
    return fetch(`${BASE}/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json() as Promise<AttachmentRow[]>);
  },

  uploadAttachment: (entityType: string, entityId: string, file: File): Promise<AttachmentRow> => {
    const token = localStorage.getItem('drydock_token');
    const form = new FormData();
    form.append('entity_type', entityType);
    form.append('entity_id', entityId);
    form.append('file', file);
    return fetch(`${BASE}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json() as Promise<AttachmentRow>);
  },

  deleteAttachment: (id: string): Promise<void> => {
    const token = localStorage.getItem('drydock_token');
    return fetch(`${BASE}/attachments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(() => undefined);
  },

  // Inventory
  warehouses: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/inventory/warehouses?page=${page}&pageSize=${pageSize}`
    ),
  inventoryItems: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/inventory/items?page=${page}&pageSize=${pageSize}`
    ),
  inventoryTransactions: (page = 1, pageSize = 50) =>
    api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(
      `/inventory/transactions?page=${page}&pageSize=${pageSize}`
    ),
  createInventoryTransaction: (data: unknown) => api('/inventory/transactions', { method: 'POST', body: data }),
};

export interface AttachmentRow {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  filename: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  presigned_url: string;
}
