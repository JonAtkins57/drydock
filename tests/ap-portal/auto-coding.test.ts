import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDescription } from '../../src/ap-portal/auto-coding.service';

// ── Pool mock helpers ──────────────────────────────────────────────

function buildClient(queryResponses: Array<{ rows: unknown[] }>) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const response = queryResponses[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(response);
    }),
    release: vi.fn(),
  };
}

function buildPool(queryResponses: Array<{ rows: unknown[] }>) {
  const client = buildClient(queryResponses);
  return {
    _client: client,
    connect: vi.fn().mockResolvedValue(client),
  };
}

// ── Constants ──────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VENDOR_ID = '00000000-0000-0000-0000-000000000100';
const LINE_ID = '00000000-0000-0000-0000-000000000300';
const ACCOUNT_ID_1 = '00000000-0000-0000-0000-000000000401';
const ACCOUNT_ID_2 = '00000000-0000-0000-0000-000000000402';
const SUGGESTION_ID = '00000000-0000-0000-0000-000000000501';

const now = new Date();

// ── normalizeDescription ───────────────────────────────────────────

describe('normalizeDescription', () => {
  it('lowercases and removes punctuation', () => {
    expect(normalizeDescription('Office Supplies!')).toBe('office supplies');
  });

  it('strips stopwords', () => {
    expect(normalizeDescription('the office for a team')).toBe('office team');
  });

  it('handles null/empty', () => {
    expect(normalizeDescription(null)).toBe('');
    expect(normalizeDescription('')).toBe('');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeDescription('  web   hosting  ')).toBe('web hosting');
  });

  it('removes numbers mixed with punctuation but keeps numeric tokens', () => {
    const result = normalizeDescription('AWS EC2 t3.micro instance');
    expect(result).toContain('aws');
    expect(result).toContain('ec2');
  });
});

// ── getSuggestions ─────────────────────────────────────────────────

describe('getSuggestions', () => {
  it('returns ML-ranked suggestions when feedback exists', async () => {
    const pool = buildPool([
      // token ILIKE query — 2 matching accounts
      {
        rows: [
          { account_id: ACCOUNT_ID_1, account_name: 'Office Expense', freq: '10' },
          { account_id: ACCOUNT_ID_2, account_name: 'IT Expense', freq: '4' },
        ],
      },
      // total/distinct count
      { rows: [{ total: '20', distinct_accounts: '3' }] },
      // INSERT coding_suggestions
      { rows: [{ id: SUGGESTION_ID }] },
    ]);

    const { getSuggestions } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getSuggestions(
      TENANT_ID, VENDOR_ID, 'office supplies', LINE_ID,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.suggestionId).toBe(SUGGESTION_ID);
      expect(result.value.suggestions).toHaveLength(2);
      expect(result.value.suggestions[0].accountId).toBe(ACCOUNT_ID_1);
      expect(result.value.suggestions[0].rank).toBe(1);
      expect(result.value.suggestions[0].confidence).toBeGreaterThan(0);
    }
  });

  it('falls back to coding_rules when no feedback exists', async () => {
    const pool = buildPool([
      // token ILIKE query — no feedback rows
      { rows: [] },
      // fallback coding_rules query
      { rows: [{ account_id: ACCOUNT_ID_1, account_name: 'Default Expense' }] },
      // INSERT coding_suggestions
      { rows: [{ id: SUGGESTION_ID }] },
    ]);

    const { getSuggestions } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getSuggestions(
      TENANT_ID, VENDOR_ID, 'consulting fees', LINE_ID,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.suggestions).toHaveLength(1);
      expect(result.value.suggestions[0].accountId).toBe(ACCOUNT_ID_1);
      expect(result.value.suggestions[0].confidence).toBe(0.5);
    }
  });

  it('returns empty suggestions when no feedback and no rules', async () => {
    const pool = buildPool([
      { rows: [] }, // no feedback
      { rows: [] }, // no rules
      { rows: [{ id: SUGGESTION_ID }] }, // insert succeeds
    ]);

    const { getSuggestions } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getSuggestions(
      TENANT_ID, VENDOR_ID, 'unknown service', LINE_ID,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.suggestions).toHaveLength(0);
    }
  });

  it('returns INTERNAL error when insert fails', async () => {
    const pool = buildPool([
      { rows: [] }, // no feedback
      { rows: [] }, // no rules
      { rows: [] }, // insert returns nothing
    ]);

    const { getSuggestions } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getSuggestions(
      TENANT_ID, VENDOR_ID, 'test', LINE_ID,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });

  it('applies Laplace smoothing to confidence scores', async () => {
    const pool = buildPool([
      {
        rows: [
          { account_id: ACCOUNT_ID_1, account_name: 'Office Expense', freq: '5' },
        ],
      },
      { rows: [{ total: '10', distinct_accounts: '2' }] },
      { rows: [{ id: SUGGESTION_ID }] },
    ]);

    const { getSuggestions } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getSuggestions(
      TENANT_ID, VENDOR_ID, 'office', LINE_ID,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Laplace: (5 + 1) / (10 + 2) = 6/12 = 0.5
      expect(result.value.suggestions[0].confidence).toBeCloseTo(0.5, 5);
    }
  });
});

// ── recordFeedback ─────────────────────────────────────────────────

describe('recordFeedback', () => {
  it('records accepted feedback and returns the record', async () => {
    const pool = buildPool([
      // lookup suggestion
      {
        rows: [{
          id: SUGGESTION_ID,
          vendor_id: VENDOR_ID,
          description_tokens: 'office supplies',
          ap_invoice_line_id: LINE_ID,
        }],
      },
      // insert feedback
      {
        rows: [{
          id: 'fb-001',
          tenant_id: TENANT_ID,
          suggestion_id: SUGGESTION_ID,
          ap_invoice_line_id: LINE_ID,
          vendor_id: VENDOR_ID,
          description_tokens: 'office supplies',
          chosen_account_id: ACCOUNT_ID_1,
          accepted: true,
          accepted_rank: 1,
          created_at: now,
          updated_at: now,
        }],
      },
    ]);

    const { recordFeedback } = await import('../../src/ap-portal/auto-coding.service');
    const result = await recordFeedback(
      TENANT_ID, SUGGESTION_ID, true, ACCOUNT_ID_1, 1,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accepted).toBe(true);
      expect(result.value.acceptedRank).toBe(1);
      expect(result.value.chosenAccountId).toBe(ACCOUNT_ID_1);
    }
  });

  it('records rejected feedback with null acceptedRank', async () => {
    const pool = buildPool([
      {
        rows: [{
          id: SUGGESTION_ID,
          vendor_id: VENDOR_ID,
          description_tokens: 'software license',
          ap_invoice_line_id: LINE_ID,
        }],
      },
      {
        rows: [{
          id: 'fb-002',
          tenant_id: TENANT_ID,
          suggestion_id: SUGGESTION_ID,
          ap_invoice_line_id: LINE_ID,
          vendor_id: VENDOR_ID,
          description_tokens: 'software license',
          chosen_account_id: ACCOUNT_ID_2,
          accepted: false,
          accepted_rank: null,
          created_at: now,
          updated_at: now,
        }],
      },
    ]);

    const { recordFeedback } = await import('../../src/ap-portal/auto-coding.service');
    const result = await recordFeedback(
      TENANT_ID, SUGGESTION_ID, false, ACCOUNT_ID_2, null,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accepted).toBe(false);
      expect(result.value.acceptedRank).toBeNull();
    }
  });

  it('returns NOT_FOUND when suggestion does not exist for tenant', async () => {
    const pool = buildPool([
      { rows: [] }, // suggestion not found
    ]);

    const { recordFeedback } = await import('../../src/ap-portal/auto-coding.service');
    const result = await recordFeedback(
      TENANT_ID, 'bad-id', true, ACCOUNT_ID_1, 1,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('returns INTERNAL when insert fails', async () => {
    const pool = buildPool([
      {
        rows: [{
          id: SUGGESTION_ID,
          vendor_id: VENDOR_ID,
          description_tokens: 'test',
          ap_invoice_line_id: LINE_ID,
        }],
      },
      { rows: [] }, // insert returns nothing
    ]);

    const { recordFeedback } = await import('../../src/ap-portal/auto-coding.service');
    const result = await recordFeedback(
      TENANT_ID, SUGGESTION_ID, true, ACCOUNT_ID_1, 1,
      pool as unknown as import('pg').Pool,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });
});

// ── getModelMetrics ────────────────────────────────────────────────

describe('getModelMetrics', () => {
  it('returns correct aggregated metrics', async () => {
    const pool = buildPool([
      // total suggestions
      { rows: [{ total_suggestions: '50' }] },
      // accepted/rejected counts
      { rows: [{ accepted_count: '35', rejected_count: '10' }] },
      // top accounts
      {
        rows: [
          { account_id: ACCOUNT_ID_1, account_name: 'Office Expense', frequency: '20', acceptance_rate: '0.85' },
          { account_id: ACCOUNT_ID_2, account_name: 'IT Expense', frequency: '15', acceptance_rate: '0.73' },
        ],
      },
    ]);

    const { getModelMetrics } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getModelMetrics(TENANT_ID, pool as unknown as import('pg').Pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSuggestions).toBe(50);
      expect(result.value.acceptedCount).toBe(35);
      expect(result.value.rejectedCount).toBe(10);
      expect(result.value.acceptanceRate).toBeCloseTo(35 / 45, 5);
      expect(result.value.topAccounts).toHaveLength(2);
      expect(result.value.topAccounts[0].accountId).toBe(ACCOUNT_ID_1);
      expect(result.value.topAccounts[0].frequency).toBe(20);
      expect(result.value.topAccounts[0].acceptanceRate).toBeCloseTo(0.85, 5);
    }
  });

  it('returns zero acceptanceRate when no feedback', async () => {
    const pool = buildPool([
      { rows: [{ total_suggestions: '5' }] },
      { rows: [{ accepted_count: '0', rejected_count: '0' }] },
      { rows: [] },
    ]);

    const { getModelMetrics } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getModelMetrics(TENANT_ID, pool as unknown as import('pg').Pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.acceptanceRate).toBe(0);
      expect(result.value.topAccounts).toHaveLength(0);
    }
  });

  it('handles empty tenant (no suggestions at all)', async () => {
    const pool = buildPool([
      { rows: [{ total_suggestions: '0' }] },
      { rows: [{ accepted_count: '0', rejected_count: '0' }] },
      { rows: [] },
    ]);

    const { getModelMetrics } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getModelMetrics(TENANT_ID, pool as unknown as import('pg').Pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSuggestions).toBe(0);
      expect(result.value.acceptanceRate).toBe(0);
    }
  });

  it('returns INTERNAL when query throws', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const { getModelMetrics } = await import('../../src/ap-portal/auto-coding.service');
    const result = await getModelMetrics(TENANT_ID, pool as unknown as import('pg').Pool);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).toContain('DB connection lost');
    }
  });
});
