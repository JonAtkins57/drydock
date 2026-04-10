import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock pool ──────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('../../src/db/connection.js', () => ({
  pool: {
    connect: vi.fn().mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    }),
  },
}));

// Import after mocks
import { getIncomeStatement, getBalanceSheet } from '../../src/gl/reporting.js';

// ── Helpers ────────────────────────────────────────────────────────

const TENANT = '00000000-0000-0000-0000-000000000001';
const ENTITY = '00000000-0000-0000-0000-000000000002';

function makeRow(
  accountType: string,
  accountNumber: string,
  accountName: string,
  netAmount: number,
) {
  return {
    account_id: `id-${accountNumber}`,
    account_number: accountNumber,
    account_name: accountName,
    account_type: accountType,
    net_amount: String(netAmount),
  };
}

// ── Income Statement ───────────────────────────────────────────────

describe('getIncomeStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRelease.mockClear();
  });

  it('returns revenue, expenses, and net income', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow('revenue', '4000', 'Sales Revenue', 500_000),
        makeRow('revenue', '4100', 'Service Revenue', 200_000),
        makeRow('expense', '5000', 'Cost of Goods Sold', 300_000),
        makeRow('expense', '6000', 'Salaries Expense', 100_000),
      ],
    });

    const result = await getIncomeStatement(TENANT, undefined, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.revenue).toHaveLength(2);
    expect(result.value.expenses).toHaveLength(2);
    expect(result.value.totalRevenue).toBe(700_000);
    expect(result.value.totalExpenses).toBe(400_000);
    expect(result.value.netIncome).toBe(300_000);
  });

  it('calculates negative net income when expenses exceed revenue', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow('revenue', '4000', 'Sales Revenue', 100_000),
        makeRow('expense', '5000', 'Operating Expenses', 250_000),
      ],
    });

    const result = await getIncomeStatement(TENANT, undefined, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.netIncome).toBe(-150_000);
  });

  it('returns empty sections when no accounts have activity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getIncomeStatement(TENANT, undefined, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revenue).toHaveLength(0);
    expect(result.value.expenses).toHaveLength(0);
    expect(result.value.totalRevenue).toBe(0);
    expect(result.value.totalExpenses).toBe(0);
    expect(result.value.netIncome).toBe(0);
  });

  it('includes dateFrom and dateTo params in query when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getIncomeStatement(
      TENANT,
      '2026-01-01T00:00:00.000Z',
      '2026-03-31T23:59:59.999Z',
      undefined,
    );

    const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(queryText).toContain('posting_date >=');
    expect(queryText).toContain('posting_date <=');
    expect(params).toContain('2026-01-01T00:00:00.000Z');
    expect(params).toContain('2026-03-31T23:59:59.999Z');
  });

  it('includes entityId filter when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getIncomeStatement(TENANT, undefined, undefined, ENTITY);

    const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(queryText).toContain('jel.entity_id =');
    expect(params).toContain(ENTITY);
  });

  it('returns INTERNAL error on db failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));

    const result = await getIncomeStatement(TENANT, undefined, undefined, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });

  it('always releases the pool client', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getIncomeStatement(TENANT, undefined, undefined, undefined);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('releases client even on db error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    await getIncomeStatement(TENANT, undefined, undefined, undefined);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

// ── Balance Sheet ──────────────────────────────────────────────────

describe('getBalanceSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRelease.mockClear();
  });

  it('returns assets, liabilities, equity, and totals', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow('asset', '1000', 'Cash', 500_000),
        makeRow('asset', '1200', 'Accounts Receivable', 200_000),
        makeRow('liability', '2000', 'Accounts Payable', 150_000),
        makeRow('equity', '3000', 'Common Stock', 550_000),
      ],
    });

    const result = await getBalanceSheet(TENANT, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.assets).toHaveLength(2);
    expect(result.value.liabilities).toHaveLength(1);
    expect(result.value.equity).toHaveLength(1);
    expect(result.value.totalAssets).toBe(700_000);
    expect(result.value.totalLiabilities).toBe(150_000);
    expect(result.value.totalEquity).toBe(550_000);
  });

  it('balance sheet is balanced: assets = liabilities + equity', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow('asset', '1000', 'Cash', 700_000),
        makeRow('liability', '2000', 'AP', 200_000),
        makeRow('equity', '3000', 'Equity', 500_000),
      ],
    });

    const result = await getBalanceSheet(TENANT, undefined, undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalAssets).toBe(
      result.value.totalLiabilities + result.value.totalEquity,
    );
  });

  it('returns empty sections when no posted activity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getBalanceSheet(TENANT, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assets).toHaveLength(0);
    expect(result.value.liabilities).toHaveLength(0);
    expect(result.value.equity).toHaveLength(0);
    expect(result.value.totalAssets).toBe(0);
  });

  it('includes asOf filter in query when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getBalanceSheet(TENANT, '2026-03-31T23:59:59.999Z', undefined);

    const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(queryText).toContain('posting_date <=');
    expect(params).toContain('2026-03-31T23:59:59.999Z');
  });

  it('includes entityId filter when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getBalanceSheet(TENANT, undefined, ENTITY);

    const [queryText, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(queryText).toContain('jel.entity_id =');
    expect(params).toContain(ENTITY);
  });

  it('returns INTERNAL error on db failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    const result = await getBalanceSheet(TENANT, undefined, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });

  it('always releases the pool client', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getBalanceSheet(TENANT, undefined, undefined);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('releases client even on db error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    await getBalanceSheet(TENANT, undefined, undefined);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
