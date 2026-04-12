import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockDelete = vi.fn();

  function makeChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['set'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();
  const deleteChain = makeChain();

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain, deleteChain]) {
      for (const key of ['values', 'set', 'where', 'from', 'offset', 'orderBy', 'limit']) {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    }
    mockDelete.mockReturnValue(deleteChain);
    (deleteChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  }

  return {
    mockReturning,
    insertChain, selectChain, updateChain, deleteChain, resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    mockDelete,
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import {
  listAllocations,
  setAllocations,
  approveAllocations,
} from '../../src/ap-portal/allocations.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const INVOICE_ID = '22222222-3333-4444-5555-666666666666';
const ACCOUNT_ID = '33333333-4444-5555-6666-777777777777';

const mockAllocation = {
  id: 'alloc-1',
  tenantId: TENANT_ID,
  invoiceId: INVOICE_ID,
  invoiceLineId: null,
  accountId: ACCOUNT_ID,
  departmentId: null,
  projectId: null,
  costCenterId: null,
  amountCents: 10000,
  allocationPct: '100',
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
};

describe('listAllocations', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns allocations for invoice', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockAllocation]);
    const result = await listAllocations(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await listAllocations(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('setAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockDelete.mockReturnValue(mocks.deleteChain);
    (mocks.deleteChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('replaces existing allocations (delete + insert)', async () => {
    mocks.mockReturning.mockResolvedValueOnce([mockAllocation]);
    const result = await setAllocations(TENANT_ID, USER_ID, INVOICE_ID, [
      { accountId: ACCOUNT_ID, amountCents: 10000, allocationPct: 100 },
    ]);
    expect(result.ok).toBe(true);
    expect(mocks.mockDelete).toHaveBeenCalled();
    expect(mocks.mockInsert).toHaveBeenCalled();
  });

  it('returns empty array when lines is empty (clears allocations)', async () => {
    const result = await setAllocations(TENANT_ID, USER_ID, INVOICE_ID, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
    expect(mocks.mockDelete).toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('validates percentages sum to 100', async () => {
    const result = await setAllocations(TENANT_ID, USER_ID, INVOICE_ID, [
      { accountId: ACCOUNT_ID, amountCents: 6000, allocationPct: 60 },
      { accountId: 'acct-2', amountCents: 3000, allocationPct: 30 },
      // only 90% — should fail
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('accepts allocations with exactly 100% total', async () => {
    mocks.mockReturning.mockResolvedValueOnce([
      { ...mockAllocation, amountCents: 6000, allocationPct: '60' },
      { ...mockAllocation, id: 'alloc-2', amountCents: 4000, allocationPct: '40' },
    ]);
    const result = await setAllocations(TENANT_ID, USER_ID, INVOICE_ID, [
      { accountId: ACCOUNT_ID, amountCents: 6000, allocationPct: 60 },
      { accountId: 'acct-2', amountCents: 4000, allocationPct: 40 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it('allows allocations without percentages (amount-only)', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockAllocation, allocationPct: null }]);
    const result = await setAllocations(TENANT_ID, USER_ID, INVOICE_ID, [
      { accountId: ACCOUNT_ID, amountCents: 10000 },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('approveAllocations', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('sets all allocations to approved status', async () => {
    (mocks.updateChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const result = await approveAllocations(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(true);
    expect(mocks.mockUpdate).toHaveBeenCalled();
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.updateChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await approveAllocations(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});
