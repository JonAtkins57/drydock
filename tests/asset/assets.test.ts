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
      (chain['groupBy'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
    mockLimit.mockReturnValue(selectChain);
  }

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
    generateNumber: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
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
});
