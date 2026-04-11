import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();
  const mockTransaction = vi.fn();
  const mockCreateJournalEntry = vi.fn();
  const mockLogAction = vi.fn();

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
    chain['leftJoin'] = vi.fn().mockReturnValue(chain);
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
      (chain['groupBy'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['leftJoin'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
    mockLimit.mockReturnValue(selectChain);
  }

  return {
    mockReturning,
    mockLimit,
    mockTransaction,
    mockCreateJournalEntry,
    mockLogAction,
    insertChain,
    selectChain,
    updateChain,
    resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    generateNumber: vi.fn(),
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

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
}));

vi.mock('../../src/gl/posting.service.js', () => ({
  createJournalEntry: mocks.mockCreateJournalEntry,
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.mockLogAction,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import Fastify from 'fastify';
import { assetRoutes } from '../../src/asset/asset.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const ASSET_ID = '33333333-4444-5555-6666-777777777777';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return {
        sub: USER_ID,
        tenantId: TENANT_ID,
        email: 'test@example.com',
        permissions: [],
      };
    },
  });
  await app.register(assetRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

function setupListMock(countValue: number, dataRows: Record<string, unknown>[]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['then'] = (resolve: (val: unknown) => void) =>
      idx === 0 ? resolve([{ value: countValue }]) : resolve(dataRows);
    return chain;
  });
}

/** Build a select chain that resolves with the given value when awaited. */
function makeThenableSelect(resolveWith: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain['from'] = vi.fn().mockReturnValue(chain);
  chain['where'] = vi.fn().mockReturnValue(chain);
  chain['limit'] = vi.fn().mockReturnValue(chain);
  chain['orderBy'] = vi.fn().mockReturnValue(chain);
  chain['offset'] = vi.fn().mockReturnValue(chain);
  chain['groupBy'] = vi.fn().mockReturnValue(chain);
  chain['leftJoin'] = vi.fn().mockReturnValue(chain);
  chain['then'] = (resolve: (val: unknown) => void) => resolve(resolveWith);
  return chain;
}

/** Build a tx mock that returns the given returning values in order. */
function makeTxMock(returningValues: unknown[][]) {
  let callIdx = 0;
  const txReturning = vi.fn().mockImplementation(() =>
    Promise.resolve(returningValues[callIdx++] ?? []),
  );
  const txChain: Record<string, ReturnType<typeof vi.fn>> = {};
  txChain['values'] = vi.fn().mockReturnValue(txChain);
  txChain['set'] = vi.fn().mockReturnValue(txChain);
  txChain['where'] = vi.fn().mockReturnValue(txChain);
  txChain['returning'] = txReturning;
  return {
    insert: vi.fn().mockReturnValue(txChain),
    update: vi.fn().mockReturnValue(txChain),
  };
}

// ════════════════════════════════════════════════════════════════════
// Fixed Asset Route Tests
// ════════════════════════════════════════════════════════════════════

describe('Fixed Asset Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.mockLogAction.mockResolvedValue(undefined);
    app = await buildApp();
  });

  // ── GET / ─────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns paginated assets', async () => {
      const asset = {
        id: ASSET_ID,
        tenantId: TENANT_ID,
        assetNumber: 'AST-000001',
        name: 'Server Rack',
        assetClass: 'equipment',
        status: 'active',
        acquisitionDate: new Date().toISOString(),
        acquisitionCost: 500000,
        salvageValue: 10000,
        usefulLifeMonths: 60,
        depreciationMethod: 'straight_line',
        createdAt: new Date().toISOString(),
      };
      setupListMock(1, [asset]);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });

    it('returns empty list', async () => {
      setupListMock(0, []);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(0);
      expect(body.data).toHaveLength(0);
    });

    it('returns 422 for invalid page param', async () => {
      const res = await app.inject({ method: 'GET', url: '/?page=notanumber' });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST / ────────────────────────────────────────────────────────

  describe('POST /', () => {
    it('creates an asset and returns 201 with assetNumber', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'AST-000001' });
      const created = {
        id: ASSET_ID,
        tenantId: TENANT_ID,
        assetNumber: 'AST-000001',
        name: 'Server Rack',
        assetClass: 'equipment',
        status: 'active',
        acquisitionDate: new Date().toISOString(),
        acquisitionCost: 500000,
        salvageValue: 0,
        usefulLifeMonths: 60,
        depreciationMethod: 'straight_line',
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'Server Rack',
          assetClass: 'equipment',
          acquisitionDate: new Date().toISOString(),
          acquisitionCost: 500000,
          usefulLifeMonths: 60,
          depreciationMethod: 'straight_line',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ assetNumber: string }>().assetNumber).toBe('AST-000001');
    });

    it('returns 422 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Missing Fields' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for invalid assetClass enum value', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'Bad Asset',
          assetClass: 'spaceship',
          acquisitionDate: new Date().toISOString(),
          acquisitionCost: 100000,
          usefulLifeMonths: 36,
          depreciationMethod: 'straight_line',
        },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 500 when number generation fails', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: false, error: { message: 'seq error' } });

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          name: 'Server Rack',
          assetClass: 'equipment',
          acquisitionDate: new Date().toISOString(),
          acquisitionCost: 500000,
          usefulLifeMonths: 60,
          depreciationMethod: 'straight_line',
        },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /roll-forward ─────────────────────────────────────────────

  describe('GET /roll-forward', () => {
    it('returns 200 with data and meta for valid date range', async () => {
      const row = {
        assetId: ASSET_ID,
        assetNumber: 'AST-000001',
        name: 'Server Rack',
        assetClass: 'equipment',
        status: 'active',
        acquisitionCost: 500000,
        accumulatedDepreciation: 50000,
        netBookValue: 450000,
        totalDepreciationExpense: 25000,
        periodCount: 3,
        beginningNetBookValue: 475000,
        endingNetBookValue: 450000,
      };

      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([row]));

      const res = await app.inject({
        method: 'GET',
        url: '/roll-forward?from=2024-01-01&to=2024-03-31&bookType=gaap',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { from: string; to: string; bookType: string | null } }>();
      expect(body.data).toHaveLength(1);
      expect(body.meta).toMatchObject({ from: '2024-01-01', to: '2024-03-31', bookType: 'gaap' });
    });

    it('returns 422 when from > to', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/roll-forward?from=2024-12-31&to=2024-01-01',
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ message: string }>().message).toMatch(/from must be on or before to/);
    });
  });

  // ── GET /:id/books ────────────────────────────────────────────────

  describe('GET /:id/books', () => {
    it('returns 200 with paginated book entries when asset exists', async () => {
      const bookEntry = {
        id: 'book-1111-2222-3333-4444',
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        bookType: 'gaap',
        periodDate: '2024-01-31',
        beginningBookValue: 500000,
        depreciationExpense: 8167,
        accumulatedDepreciation: 8167,
        endingBookValue: 491833,
      };

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        if (idx === 0) return makeThenableSelect([{ id: ASSET_ID }]);
        if (idx === 1) return makeThenableSelect([{ value: 1 }]);
        return makeThenableSelect([bookEntry]);
      });

      const res = await app.inject({ method: 'GET', url: `/${ASSET_ID}/books` });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });

    it('returns 404 when asset not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: `/${ASSET_ID}/books` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /:id ──────────────────────────────────────────────────────

  describe('GET /:id', () => {
    it('returns 200 with asset when found', async () => {
      const asset = {
        id: ASSET_ID,
        tenantId: TENANT_ID,
        assetNumber: 'AST-000001',
        name: 'Server Rack',
        status: 'active',
      };
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([asset]));

      const res = await app.inject({ method: 'GET', url: `/${ASSET_ID}` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ id: string }>().id).toBe(ASSET_ID);
    });

    it('returns 404 when asset not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: `/${ASSET_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /:id ────────────────────────────────────────────────────

  describe('PATCH /:id', () => {
    it('returns 200 with updated asset on valid body', async () => {
      const existing = {
        id: ASSET_ID,
        tenantId: TENANT_ID,
        name: 'Old Name',
        locationId: null,
        departmentId: null,
        usefulLifeMonths: 60,
        salvageValue: 10000,
        status: 'active',
      };
      const updated = { ...existing, name: 'New Name' };

      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([existing]));
      mocks.mockReturning.mockResolvedValueOnce([updated]);

      const res = await app.inject({
        method: 'PATCH',
        url: `/${ASSET_ID}`,
        payload: { name: 'New Name' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ name: string }>().name).toBe('New Name');
    });

    it('returns 404 when asset not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([]));

      const res = await app.inject({
        method: 'PATCH',
        url: `/${ASSET_ID}`,
        payload: { name: 'New Name' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 on invalid body (empty name string)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/${ASSET_ID}`,
        payload: { name: '' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /:id/actions/depreciate ──────────────────────────────────

  describe('POST /:id/actions/depreciate', () => {
    const baseAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      assetNumber: 'AST-000001',
      name: 'Server Rack',
      status: 'active',
      assetClass: 'equipment',
      acquisitionCost: 500000,
      salvageValue: 10000,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      netBookValue: 490000,
      accumulatedDepreciation: 10000,
    };

    it('returns 201 with bookRow and asset for straight_line method', async () => {
      const bookRow = {
        id: 'book-1111-2222-3333-4444',
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        bookType: 'gaap',
        periodDate: '2024-01-31',
        beginningBookValue: 490000,
        depreciationExpense: 8167,
        accumulatedDepreciation: 18167,
        endingBookValue: 481833,
      };
      const updatedAsset = { ...baseAsset, accumulatedDepreciation: 18167, netBookValue: 481833 };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        if (idx === 0) return makeThenableSelect([baseAsset]); // asset fetch
        return makeThenableSelect([]); // duplicate check — none found
      });

      mocks.mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = makeTxMock([[bookRow], [updatedAsset]]);
        return cb(tx);
      });

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/depreciate`,
        payload: { bookType: 'gaap', periodDate: '2024-01-31' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ bookRow: unknown; asset: unknown }>();
      expect(body).toHaveProperty('bookRow');
      expect(body).toHaveProperty('asset');
    });

    it('returns 422 when depreciationMethod is units_of_production and unitsProduced is absent', async () => {
      const uopAsset = { ...baseAsset, depreciationMethod: 'units_of_production' };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        if (idx === 0) return makeThenableSelect([uopAsset]);
        return makeThenableSelect([]);
      });

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/depreciate`,
        payload: { bookType: 'gaap', periodDate: '2024-01-31' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ message: string }>().message).toMatch(/unitsProduced is required/);
    });

    it('returns 422 when asset status is disposed', async () => {
      const disposedAsset = { ...baseAsset, status: 'disposed' };
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([disposedAsset]));

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/depreciate`,
        payload: { bookType: 'gaap', periodDate: '2024-01-31' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ message: string }>().message).toMatch(/disposed/);
    });

    it('returns 409 when book entry already exists for same asset+bookType+periodDate', async () => {
      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        if (idx === 0) return makeThenableSelect([baseAsset]);
        return makeThenableSelect([{ id: 'existing-book-id' }]); // duplicate found
      });

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/depreciate`,
        payload: { bookType: 'gaap', periodDate: '2024-01-31' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── POST /:id/actions/dispose ─────────────────────────────────────

  describe('POST /:id/actions/dispose', () => {
    const baseAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      assetNumber: 'AST-000001',
      name: 'Server Rack',
      status: 'active',
      assetClass: 'equipment',
      acquisitionCost: 500000,
      salvageValue: 10000,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      netBookValue: 250000,
      accumulatedDepreciation: 250000,
    };

    const disposePayload = {
      disposalType: 'sale',
      disposalDate: new Date().toISOString(),
      proceedsAmount: 300000,
    };

    it('returns 201 with disposal and asset for valid disposal', async () => {
      const disposal = {
        id: 'disposal-1111-2222-3333',
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        disposalType: 'sale',
        disposalDate: disposePayload.disposalDate,
        proceedsAmount: 300000,
        netBookValueAtDisposal: 250000,
        gainLossAmount: 50000,
      };
      const updatedAsset = { ...baseAsset, status: 'disposed', isActive: false };

      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([baseAsset]));
      mocks.mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = makeTxMock([[disposal], [updatedAsset]]);
        return cb(tx);
      });

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/dispose`,
        payload: disposePayload,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ disposal: unknown; asset: unknown }>();
      expect(body).toHaveProperty('disposal');
      expect(body).toHaveProperty('asset');
    });

    it('returns 422 when asset is already disposed', async () => {
      const disposedAsset = { ...baseAsset, status: 'disposed' };
      mocks.mockSelect.mockImplementationOnce(() => makeThenableSelect([disposedAsset]));

      const res = await app.inject({
        method: 'POST',
        url: `/${ASSET_ID}/actions/dispose`,
        payload: disposePayload,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ message: string }>().message).toMatch(/already disposed/);
    });
  });
});
