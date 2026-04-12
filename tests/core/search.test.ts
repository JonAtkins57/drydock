import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockClient = {
    query: mockQuery,
    release: mockRelease,
  };
  const mockConnect = vi.fn().mockResolvedValue(mockClient);

  return { mockQuery, mockRelease, mockClient, mockConnect };
});

vi.mock('../../src/db/connection.js', () => ({
  pool: {
    connect: mocks.mockConnect,
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { globalSearch } from '../../src/search/search.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('globalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockConnect.mockResolvedValue(mocks.mockClient);
    mocks.mockQuery
      .mockResolvedValueOnce(undefined) // SET app.current_tenant
      .mockResolvedValueOnce({ rows: [] }) // main query
      .mockResolvedValueOnce(undefined); // RESET app.current_tenant
  });

  it('returns empty array for empty query string', async () => {
    const result = await globalSearch(TENANT_ID, '   ', ['customer', 'vendor']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
    expect(mocks.mockConnect).not.toHaveBeenCalled();
  });

  it('returns empty array for empty types array', async () => {
    const result = await globalSearch(TENANT_ID, 'acme', []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('sets current_tenant, queries, and resets', async () => {
    const result = await globalSearch(TENANT_ID, 'acme', ['customer']);
    expect(result.ok).toBe(true);
    expect(mocks.mockQuery).toHaveBeenNthCalledWith(1, 'SET app.current_tenant = $1', [TENANT_ID]);
    expect(mocks.mockQuery).toHaveBeenNthCalledWith(3, 'RESET app.current_tenant');
    expect(mocks.mockRelease).toHaveBeenCalled();
  });

  it('maps result rows to SearchResult with url', async () => {
    mocks.mockQuery
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { id: 'cust-1', type: 'customer', label: 'Acme Corp', sublabel: 'CUST-001', score: 0.9 },
        ],
      })
      .mockResolvedValueOnce(undefined);

    const result = await globalSearch(TENANT_ID, 'acme', ['customer']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.url).toBe('/customers/cust-1');
      expect(result.value[0]?.type).toBe('customer');
    }
  });

  it('releases connection even on query failure', async () => {
    mocks.mockQuery
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB error'));

    const result = await globalSearch(TENANT_ID, 'acme', ['customer']);
    // RESET won't be called since error occurs before it, but release should still happen
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
    expect(mocks.mockRelease).toHaveBeenCalled();
  });

  it('truncates queries over 200 chars', async () => {
    const longQuery = 'a'.repeat(300);
    await globalSearch(TENANT_ID, longQuery, ['customer']);
    const mainQueryCall = mocks.mockQuery.mock.calls[1];
    expect(mainQueryCall?.[1]?.[1]?.length).toBe(200);
  });

  it('ignores unknown search types', async () => {
    // 'unknown_type' should be filtered out, nothing to query
    const result = await globalSearch(TENANT_ID, 'acme', ['unknown_type' as never]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });
});
