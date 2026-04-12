import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();

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

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain]) {
      for (const key of ['values', 'set', 'where', 'from', 'offset', 'orderBy', 'limit']) {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    }
  }

  return {
    mockReturning,
    insertChain, selectChain, updateChain, resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import {
  listMatchingRules,
  createMatchingRule,
  updateMatchingRule,
  deleteMatchingRule,
  getRuleForVendor,
} from '../../src/p2p/po-matching-rules.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const RULE_ID = '22222222-3333-4444-5555-666666666666';
const VENDOR_ID = '33333333-4444-5555-6666-777777777777';

const mockRule = {
  id: RULE_ID,
  tenantId: TENANT_ID,
  vendorId: null,
  priceTolerance: 5,
  qtyTolerance: 2,
  allowOverReceipt: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
};

describe('listMatchingRules', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns active rules', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRule]);
    const result = await listMatchingRules(TENANT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await listMatchingRules(TENANT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('createMatchingRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockInsert.mockReturnValue(mocks.insertChain); });

  it('creates a global matching rule', async () => {
    mocks.mockReturning.mockResolvedValueOnce([mockRule]);
    const result = await createMatchingRule(TENANT_ID, USER_ID, {
      priceTolerance: 5,
      qtyTolerance: 2,
      allowOverReceipt: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenantId).toBe(TENANT_ID);
      expect(result.value.vendorId).toBeNull();
    }
  });

  it('creates a vendor-specific rule', async () => {
    const vendorRule = { ...mockRule, vendorId: VENDOR_ID };
    mocks.mockReturning.mockResolvedValueOnce([vendorRule]);
    const result = await createMatchingRule(TENANT_ID, USER_ID, {
      vendorId: VENDOR_ID,
      priceTolerance: 10,
      qtyTolerance: 5,
      allowOverReceipt: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.vendorId).toBe(VENDOR_ID);
  });

  it('returns INTERNAL when insert returns no row', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await createMatchingRule(TENANT_ID, USER_ID, {
      priceTolerance: 5,
      qtyTolerance: 2,
      allowOverReceipt: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('updateMatchingRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('updates tolerance values', async () => {
    const updated = { ...mockRule, priceTolerance: 10 };
    mocks.mockReturning.mockResolvedValueOnce([updated]);
    const result = await updateMatchingRule(TENANT_ID, USER_ID, RULE_ID, { priceTolerance: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.priceTolerance).toBe(10);
  });

  it('returns NOT_FOUND when rule does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await updateMatchingRule(TENANT_ID, USER_ID, RULE_ID, { priceTolerance: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('deleteMatchingRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('soft-deletes by setting isActive=false', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockRule, isActive: false }]);
    const result = await deleteMatchingRule(TENANT_ID, RULE_ID);
    expect(result.ok).toBe(true);
    // confirm update (soft delete) was called, not delete
    expect(mocks.mockUpdate).toHaveBeenCalled();
  });

  it('returns NOT_FOUND when rule does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await deleteMatchingRule(TENANT_ID, RULE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('getRuleForVendor', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('prefers vendor-specific rule over global', async () => {
    const globalRule = { ...mockRule, id: 'global-1', vendorId: null };
    const vendorRule = { ...mockRule, id: 'vendor-1', vendorId: VENDOR_ID };
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([globalRule, vendorRule]);
    const result = await getRuleForVendor(TENANT_ID, VENDOR_ID);
    expect(result?.id).toBe('vendor-1');
  });

  it('falls back to global rule when no vendor-specific rule', async () => {
    const globalRule = { ...mockRule, id: 'global-1', vendorId: null };
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([globalRule]);
    const result = await getRuleForVendor(TENANT_ID, VENDOR_ID);
    expect(result?.id).toBe('global-1');
  });

  it('returns null when no rules exist', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await getRuleForVendor(TENANT_ID, VENDOR_ID);
    expect(result).toBeNull();
  });
});
