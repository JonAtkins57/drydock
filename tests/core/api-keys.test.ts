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
  createApiKey,
  listApiKeys,
  revokeApiKey,
  validateApiKey,
} from '../../src/core/api-keys.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TENANT_ID_2 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const KEY_ID = '22222222-3333-4444-5555-666666666666';

const mockKeyRow = {
  id: KEY_ID,
  name: 'Test Key',
  keyHash: 'abc123hash',
  tenantIds: [TENANT_ID],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  createdBy: USER_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('createApiKey', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockInsert.mockReturnValue(mocks.insertChain); });

  it('creates key and returns rawKey once', async () => {
    mocks.mockReturning.mockResolvedValueOnce([mockKeyRow]);
    const result = await createApiKey({ name: 'Test Key', tenantIds: [TENANT_ID], createdBy: USER_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rawKey).toMatch(/^drydock_[0-9a-f]{64}$/);
      expect(result.value.id).toBe(KEY_ID);
      expect(result.value.tenantIds).toEqual([TENANT_ID]);
    }
  });

  it('supports multiple tenants on one key', async () => {
    const multiRow = { ...mockKeyRow, tenantIds: [TENANT_ID, TENANT_ID_2] };
    mocks.mockReturning.mockResolvedValueOnce([multiRow]);
    const result = await createApiKey({ name: 'Multi-Tenant Key', tenantIds: [TENANT_ID, TENANT_ID_2] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tenantIds).toHaveLength(2);
  });

  it('rejects empty tenantIds', async () => {
    const result = await createApiKey({ name: 'No Tenants', tenantIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('returns INTERNAL when insert returns no row', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await createApiKey({ name: 'Test Key', tenantIds: [TENANT_ID] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });

  it('each call generates a unique rawKey', async () => {
    mocks.mockReturning
      .mockResolvedValueOnce([mockKeyRow])
      .mockResolvedValueOnce([{ ...mockKeyRow, id: 'other-id' }]);
    const r1 = await createApiKey({ name: 'Key 1', tenantIds: [TENANT_ID] });
    const r2 = await createApiKey({ name: 'Key 2', tenantIds: [TENANT_ID] });
    if (r1.ok && r2.ok) expect(r1.value.rawKey).not.toBe(r2.value.rawKey);
  });
});

describe('listApiKeys', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns active keys', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockKeyRow]);
    const result = await listApiKeys();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await listApiKeys();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('revokeApiKey', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('soft-revokes by setting isActive=false', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockKeyRow, isActive: false }]);
    const result = await revokeApiKey(KEY_ID);
    expect(result.ok).toBe(true);
    expect(mocks.mockUpdate).toHaveBeenCalled();
  });

  it('returns NOT_FOUND when key does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await revokeApiKey(KEY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns INTERNAL on DB failure', async () => {
    mocks.mockReturning.mockRejectedValueOnce(new Error('fail'));
    const result = await revokeApiKey(KEY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('validateApiKey', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns null for DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    const result = await validateApiKey('drydock_invalidkey');
    expect(result).toBeNull();
  });

  it('returns null when key not found', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await validateApiKey('drydock_notfound');
    expect(result).toBeNull();
  });

  it('returns null for expired key', async () => {
    const expiredRow = { ...mockKeyRow, expiresAt: new Date('2020-01-01') };
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([expiredRow]);
    const result = await validateApiKey('drydock_expiredkey');
    expect(result).toBeNull();
  });

  it('returns id and tenantIds for valid key', async () => {
    // Mock select to return matching row, and update (fire-and-forget) to resolve quietly
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    (mocks.updateChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockKeyRow]);
    const result = await validateApiKey('drydock_somevalidkey');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(KEY_ID);
    expect(result?.tenantIds).toEqual([TENANT_ID]);
  });

  it('returns valid result for non-expiring key (expiresAt null)', async () => {
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    (mocks.updateChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const noExpiry = { ...mockKeyRow, expiresAt: null };
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([noExpiry]);
    const result = await validateApiKey('drydock_noexpiry');
    expect(result).not.toBeNull();
  });
});
