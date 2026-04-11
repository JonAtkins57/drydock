import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock pool ──────────────────────────────────────────────────────

const { mockQuery, mockRelease } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock('../../src/db/connection.js', () => ({
  pool: {
    connect: vi.fn().mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    }),
  },
}));

// Import after mocks
import { getBalanceSheetRollForward } from '../../src/gl/reports/balance-sheet-rollforward.js';

// ── Constants ──────────────────────────────────────────────────────

const TENANT = '00000000-0000-0000-0000-000000000001';
const PERIOD_ID = '00000000-0000-0000-0000-000000000010';
const START_DATE = '2026-01-01T00:00:00.000Z';
const END_DATE = '2026-01-31T23:59:59.999Z';

const PERIOD_ROW = { start_date: START_DATE, end_date: END_DATE };

function makeRollForwardRow(
  accountType: string,
  accountNumber: string,
  accountName: string,
  beginningBalance: number,
  periodDebits: number,
  periodCredits: number,
  endingBalance: number,
) {
  return {
    account_id: `id-${accountNumber}`,
    account_number: accountNumber,
    account_name: accountName,
    account_type: accountType,
    beginning_balance: String(beginningBalance),
    period_debits: String(periodDebits),
    period_credits: String(periodCredits),
    ending_balance: String(endingBalance),
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('getBalanceSheetRollForward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRelease.mockClear();
  });

  it('correct beginning balance — SQL uses posting_date < period start_date', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({
        rows: [makeRollForwardRow('asset', '1000', 'Cash', 400_000, 100_000, 50_000, 450_000)],
      });

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].beginningBalance).toBe(400_000);

    // Verify SQL uses the period start_date for the beginning balance filter
    const [queryText, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(queryText).toContain('posting_date < $3::timestamptz');
    expect(params).toContain(START_DATE);
  });

  it('correct period activity — SQL filters by period_id for debits/credits', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({
        rows: [makeRollForwardRow('asset', '1000', 'Cash', 0, 200_000, 75_000, 125_000)],
      });

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value[0].periodDebits).toBe(200_000);
    expect(result.value[0].periodCredits).toBe(75_000);

    const [queryText, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(queryText).toContain('period_id = $2');
    expect(params).toContain(PERIOD_ID);
  });

  it('correct ending balance — SQL outer filter uses posting_date <= period end_date', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({
        rows: [makeRollForwardRow('liability', '2000', 'AP', 100_000, 50_000, 150_000, 200_000)],
      });

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value[0].endingBalance).toBe(200_000);

    const [queryText, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(queryText).toContain('posting_date <= $4::timestamptz');
    expect(params).toContain(END_DATE);
  });

  it('empty result → returns ok with empty array when no accounts have activity', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('optional accountType filter narrows account_type IN clause', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    await getBalanceSheetRollForward(TENANT, PERIOD_ID, 'asset');

    const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    // Only 'asset' should appear in the params for the IN clause
    expect(params).toContain('asset');
    expect(params).not.toContain('liability');
    expect(params).not.toContain('equity');
  });

  it('returns INTERNAL error on db failure during main query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockRejectedValueOnce(new Error('query timeout'));

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });

  it('returns INTERNAL error on db failure during period lookup', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });

  it('pool client always released on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PERIOD_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('pool client always released on db failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));

    await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('returns NOT_FOUND when period does not exist for tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getBalanceSheetRollForward(TENANT, PERIOD_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
