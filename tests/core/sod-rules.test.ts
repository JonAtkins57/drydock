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
  listSodRules,
  createSodRule,
  updateSodRule,
  deleteSodRule,
  checkSodConflict,
} from '../../src/core/sod-rules.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const RULE_ID = '22222222-3333-4444-5555-666666666666';

const mockRule = {
  id: RULE_ID,
  tenantId: TENANT_ID,
  ruleKey: 'no_self_approve_invoice',
  entityType: 'invoice',
  actionA: 'ap.invoice.create',
  actionB: 'ap.invoice.approve',
  description: 'Cannot create and approve own invoice',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('listSodRules', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns active SOD rules for tenant', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRule]);
    const result = await listSodRules(TENANT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await listSodRules(TENANT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('createSodRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockInsert.mockReturnValue(mocks.insertChain); });

  it('creates a SOD rule', async () => {
    mocks.mockReturning.mockResolvedValueOnce([mockRule]);
    const result = await createSodRule(TENANT_ID, {
      ruleKey: 'no_self_approve_invoice',
      entityType: 'invoice',
      actionA: 'ap.invoice.create',
      actionB: 'ap.invoice.approve',
      description: 'Cannot create and approve own invoice',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenantId).toBe(TENANT_ID);
      expect(result.value.ruleKey).toBe('no_self_approve_invoice');
    }
  });

  it('returns INTERNAL when insert returns no row', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await createSodRule(TENANT_ID, {
      ruleKey: 'no_self_approve_invoice',
      entityType: 'invoice',
      actionA: 'ap.invoice.create',
      actionB: 'ap.invoice.approve',
      description: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('updateSodRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('updates rule description', async () => {
    const updated = { ...mockRule, description: 'Updated description' };
    mocks.mockReturning.mockResolvedValueOnce([updated]);
    const result = await updateSodRule(TENANT_ID, RULE_ID, { description: 'Updated description' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toBe('Updated description');
  });

  it('returns NOT_FOUND when rule does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await updateSodRule(TENANT_ID, RULE_ID, { description: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('deleteSodRule', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('soft-deletes by setting isActive=false (update, not hard delete)', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockRule, isActive: false }]);
    const result = await deleteSodRule(TENANT_ID, RULE_ID);
    expect(result.ok).toBe(true);
    expect(mocks.mockUpdate).toHaveBeenCalled();
  });

  it('returns NOT_FOUND when rule does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await deleteSodRule(TENANT_ID, RULE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('checkSodConflict', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns conflicting rule when actions match', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRule]);
    const result = await checkSodConflict(TENANT_ID, 'invoice', 'ap.invoice.create', 'ap.invoice.approve');
    expect(result).not.toBeNull();
    expect(result?.ruleKey).toBe('no_self_approve_invoice');
  });

  it('detects conflict regardless of action order', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRule]);
    // actionA/B reversed from how the rule is defined
    const result = await checkSodConflict(TENANT_ID, 'invoice', 'ap.invoice.approve', 'ap.invoice.create');
    expect(result).not.toBeNull();
  });

  it('returns null when no conflict exists', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRule]);
    const result = await checkSodConflict(TENANT_ID, 'invoice', 'ap.invoice.create', 'ap.invoice.post');
    expect(result).toBeNull();
  });
});
