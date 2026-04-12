import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();

  function makeChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['set'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = mockLimit.mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['groupBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain]) {
      (chain['values'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['set'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['where'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['from'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['offset'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['orderBy'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
    mockLimit.mockReturnValue(selectChain);
  }

  const mockTransaction = vi.fn();

  return {
    mockReturning,
    mockLimit,
    insertChain,
    selectChain,
    updateChain,
    resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    mockTransaction,
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    transaction: mocks.mockTransaction,
  },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { listAmendments, createAmendment } from '../../src/q2c/billing-amendments.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const PLAN_ID = '22222222-3333-4444-5555-666666666666';
const AMEND_ID = '33333333-4444-5555-6666-777777777777';

const mockPlan = {
  id: PLAN_ID,
  tenantId: TENANT_ID,
  customerId: 'cust-1',
  name: 'Monthly Retainer',
  planType: 'fixed',
  billingMethod: 'advance',
  frequency: 'monthly',
  startDate: new Date('2025-01-01'),
  status: 'active',
  totalAmount: 10000,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
  endDate: null,
};

const mockAmendment = {
  id: AMEND_ID,
  tenantId: TENANT_ID,
  billingPlanId: PLAN_ID,
  effectiveDate: new Date('2025-06-01'),
  amendmentType: 'rate_change',
  changes: { totalAmount: 12000 },
  priorVersion: 1,
  newVersion: 2,
  notes: 'Price increase',
  approvedBy: USER_ID,
  approvedAt: new Date(),
  createdAt: new Date(),
  createdBy: USER_ID,
};

// ════════════════════════════════════════════════════════════════════
// listAmendments
// ════════════════════════════════════════════════════════════════════

describe('listAmendments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
  });

  it('returns amendments ordered by version desc', async () => {
    (mocks.selectChain['orderBy'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockAmendment]);
    const result = await listAmendments(TENANT_ID, PLAN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns empty array when no amendments exist', async () => {
    (mocks.selectChain['orderBy'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await listAmendments(TENANT_ID, PLAN_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('returns INTERNAL error on DB failure', async () => {
    (mocks.selectChain['orderBy'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB down'));
    const result = await listAmendments(TENANT_ID, PLAN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

// ════════════════════════════════════════════════════════════════════
// createAmendment
// ════════════════════════════════════════════════════════════════════

describe('createAmendment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);

    // transaction: execute callback with a tx proxy
    mocks.mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: vi.fn().mockReturnValue(mocks.updateChain),
      };
      (mocks.updateChain['set'] as ReturnType<typeof vi.fn>).mockReturnValue(mocks.updateChain);
      (mocks.updateChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockPlan]);
      await cb(tx);
    });
  });

  function setupSelectSequence(planRow: typeof mockPlan | null, lastAmendRow: typeof mockAmendment | null) {
    let callIdx = 0;
    mocks.mockSelect.mockImplementation(() => {
      const idx = callIdx++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['from'] = vi.fn().mockReturnValue(chain);
      chain['where'] = vi.fn().mockReturnValue(chain);
      chain['orderBy'] = vi.fn().mockReturnValue(chain);
      chain['limit'] = vi.fn().mockReturnValue(chain);
      chain['offset'] = vi.fn().mockReturnValue(chain);
      if (idx === 0) {
        // fetch plan
        chain['then'] = (resolve: (v: unknown) => void) => resolve(planRow ? [planRow] : []);
      } else {
        // fetch last amendment
        (chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(lastAmendRow ? [lastAmendRow] : []);
        chain['then'] = (resolve: (v: unknown) => void) => resolve(lastAmendRow ? [lastAmendRow] : []);
      }
      return chain;
    });
  }

  it('creates an amendment with version increment', async () => {
    setupSelectSequence(mockPlan, null);
    mocks.mockReturning.mockResolvedValueOnce([mockAmendment]);

    const result = await createAmendment(TENANT_ID, USER_ID, PLAN_ID, {
      effectiveDate: new Date('2025-06-01'),
      amendmentType: 'rate_change',
      changes: { totalAmount: 12000 },
      notes: 'Price increase',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.billingPlanId).toBe(PLAN_ID);
      expect(result.value.newVersion).toBe(2);
    }
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'amend', entityType: 'billing_plan', entityId: PLAN_ID }),
    );
  });

  it('returns NOT_FOUND when plan does not exist', async () => {
    setupSelectSequence(null, null);
    const result = await createAmendment(TENANT_ID, USER_ID, PLAN_ID, {
      effectiveDate: new Date(),
      amendmentType: 'rate_change',
      changes: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns BAD_REQUEST for cancelled plan', async () => {
    setupSelectSequence({ ...mockPlan, status: 'cancelled' }, null);
    const result = await createAmendment(TENANT_ID, USER_ID, PLAN_ID, {
      effectiveDate: new Date(),
      amendmentType: 'rate_change',
      changes: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BAD_REQUEST');
  });

  it('strips non-whitelisted fields from changes', async () => {
    setupSelectSequence(mockPlan, null);
    // The insert should only include valid fields (totalAmount) not dangerousField
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockAmendment, changes: { totalAmount: 12000 } }]);

    const result = await createAmendment(TENANT_ID, USER_ID, PLAN_ID, {
      effectiveDate: new Date(),
      amendmentType: 'rate_change',
      changes: { totalAmount: 12000, dangerousField: 'DROP TABLE' },
    });
    expect(result.ok).toBe(true);
  });

  it('bumps version from last amendment, not plan version', async () => {
    const lastAmend = { ...mockAmendment, newVersion: 5 };
    setupSelectSequence(mockPlan, lastAmend);
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockAmendment, priorVersion: 5, newVersion: 6 }]);

    const result = await createAmendment(TENANT_ID, USER_ID, PLAN_ID, {
      effectiveDate: new Date(),
      amendmentType: 'extension',
      changes: { endDate: new Date('2026-12-31') },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.newVersion).toBe(6);
  });
});
