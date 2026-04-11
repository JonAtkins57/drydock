import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();

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

  function makeInsertChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    return chain;
  }

  return {
    mockReturning,
    makeThenableSelect,
    makeInsertChain,
    mockInsert: vi.fn(),
    mockSelect: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
  },
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import Fastify from 'fastify';
import { cashForecastRoutes } from '../../src/cash-forecast/cash-forecast.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID   = '11111111-2222-3333-4444-555555555555';
const SCENARIO_ID = '33333333-4444-5555-6666-777777777777';
const BANK_ID     = '88888888-9999-aaaa-bbbb-cccccccccccc';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return {
        sub: TENANT_ID,
        tenantId: TENANT_ID,
        email: 'test@example.com',
        permissions: [],
      };
    },
  });
  await app.register(cashForecastRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

// ════════════════════════════════════════════════════════════════════
// Cash Forecast Route Tests
// ════════════════════════════════════════════════════════════════════

describe('Cash Forecast Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.mockInsert.mockReturnValue(mocks.makeInsertChain());
    app = await buildApp();
  });

  // ── GET / — list scenarios ────────────────────────────────────────

  describe('GET /', () => {
    it('returns paginated scenarios', async () => {
      const scenario = {
        id: SCENARIO_ID,
        tenantId: TENANT_ID,
        name: 'Q2 2026 Base',
        scenario: 'base',
        windowStart: '2026-04-07',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        return mocks.makeThenableSelect(idx === 0 ? [{ value: 1 }] : [scenario]);
      });

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });

    it('returns empty list when no scenarios exist', async () => {
      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        return mocks.makeThenableSelect(idx === 0 ? [{ value: 0 }] : []);
      });

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

    it('respects pagination params', async () => {
      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        return mocks.makeThenableSelect(idx === 0 ? [{ value: 5 }] : []);
      });

      const res = await app.inject({ method: 'GET', url: '/?page=2&pageSize=2' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ meta: { page: number; pageSize: number; totalPages: number } }>();
      expect(body.meta.page).toBe(2);
      expect(body.meta.pageSize).toBe(2);
      expect(body.meta.totalPages).toBe(3);
    });
  });

  // ── POST / — create scenario ──────────────────────────────────────

  describe('POST /', () => {
    it('creates a scenario and returns 201', async () => {
      const created = {
        id: SCENARIO_ID,
        tenantId: TENANT_ID,
        name: 'Q2 2026 Base',
        scenario: 'base',
        windowStart: '2026-04-07',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Q2 2026 Base', scenario: 'base', windowStart: '2026-04-07' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ id: string }>().id).toBe(SCENARIO_ID);
    });

    it('defaults scenario to base when omitted', async () => {
      const created = {
        id: SCENARIO_ID,
        tenantId: TENANT_ID,
        name: 'Test',
        scenario: 'base',
        windowStart: '2026-04-07',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', windowStart: '2026-04-07' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 422 when name is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { windowStart: '2026-04-07' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when windowStart format is invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', windowStart: 'April 7' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for invalid scenario enum value', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { name: 'Test', scenario: 'moonshot', windowStart: '2026-04-07' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── GET /rolling — 13-week rolling forecast ───────────────────────

  describe('GET /rolling', () => {
    it('returns 13 weekly buckets with correct structure', async () => {
      // First call = AR invoices, second call = AP invoices (via Promise.all)
      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        callIdx++;
        return mocks.makeThenableSelect([]);
      });

      const res = await app.inject({ method: 'GET', url: '/rolling' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ weekStart: string; arInflowCents: number; apOutflowCents: number; netCents: number }> }>();
      expect(body.data).toHaveLength(13);
      expect(body.data[0]).toHaveProperty('weekStart');
      expect(body.data[0]).toHaveProperty('arInflowCents');
      expect(body.data[0]).toHaveProperty('apOutflowCents');
      expect(body.data[0]).toHaveProperty('netCents');
    });

    it('accumulates AR inflows from invoices in the correct week bucket', async () => {
      // Compute today's Monday
      const today = new Date();
      const day = today.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diff);
      const mondayStr = monday.toISOString().slice(0, 10);

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        if (idx === 0) {
          // AR invoices — one invoice due this Monday
          return mocks.makeThenableSelect([
            { dueDate: mondayStr, totalAmount: 100000, paidAmount: 20000 },
          ]);
        }
        // AP invoices — none
        return mocks.makeThenableSelect([]);
      });

      const res = await app.inject({ method: 'GET', url: '/rolling' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ weekStart: string; arInflowCents: number; netCents: number }> }>();
      expect(body.data[0].arInflowCents).toBe(80000);
      expect(body.data[0].netCents).toBe(80000);
    });

    it('accumulates AP outflows in the correct week bucket', async () => {
      const today = new Date();
      const day = today.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diff);
      const mondayStr = monday.toISOString().slice(0, 10);

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        if (idx === 0) return mocks.makeThenableSelect([]);
        // AP invoices — one bill due this Monday
        return mocks.makeThenableSelect([
          { dueDate: mondayStr, totalAmount: 50000 },
        ]);
      });

      const res = await app.inject({ method: 'GET', url: '/rolling' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ weekStart: string; apOutflowCents: number; netCents: number }> }>();
      expect(body.data[0].apOutflowCents).toBe(50000);
      expect(body.data[0].netCents).toBe(-50000);
    });

    it('weekStart values are valid YYYY-MM-DD Monday dates', async () => {
      mocks.mockSelect.mockImplementation(() => mocks.makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: '/rolling' });
      const body = res.json<{ data: Array<{ weekStart: string }> }>();
      for (const bucket of body.data) {
        expect(bucket.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const d = new Date(bucket.weekStart + 'T00:00:00Z');
        // Monday = 1
        expect(d.getUTCDay()).toBe(1);
      }
    });
  });

  // ── GET /:id — scenario with lines ───────────────────────────────

  describe('GET /:id', () => {
    it('returns scenario with its lines when found', async () => {
      const scenario = {
        id: SCENARIO_ID,
        tenantId: TENANT_ID,
        name: 'Q2 2026 Base',
        scenario: 'base',
        windowStart: '2026-04-07',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      const line = {
        id: 'line-1111-2222-3333-4444',
        tenantId: TENANT_ID,
        scenarioId: SCENARIO_ID,
        weekStart: '2026-04-07',
        inflowCents: 100000,
        outflowCents: 50000,
        notes: null,
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        return mocks.makeThenableSelect(idx === 0 ? [scenario] : [line]);
      });

      const res = await app.inject({ method: 'GET', url: `/${SCENARIO_ID}` });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; lines: unknown[] }>();
      expect(body.id).toBe(SCENARIO_ID);
      expect(body.lines).toHaveLength(1);
    });

    it('returns 404 when scenario not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: `/${SCENARIO_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /:id/lines — add forecast line ───────────────────────────

  describe('POST /:id/lines', () => {
    it('adds a line and returns 201', async () => {
      const scenario = { id: SCENARIO_ID, tenantId: TENANT_ID };
      const line = {
        id: 'line-1111-2222-3333-4444',
        tenantId: TENANT_ID,
        scenarioId: SCENARIO_ID,
        weekStart: '2026-04-07',
        inflowCents: 200000,
        outflowCents: 80000,
        notes: 'Q2 estimate',
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([scenario]));
      mocks.mockReturning.mockResolvedValueOnce([line]);

      const res = await app.inject({
        method: 'POST',
        url: `/${SCENARIO_ID}/lines`,
        payload: {
          weekStart: '2026-04-07',
          inflowCents: 200000,
          outflowCents: 80000,
          notes: 'Q2 estimate',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ scenarioId: string }>().scenarioId).toBe(SCENARIO_ID);
    });

    it('returns 404 when scenario not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([]));

      const res = await app.inject({
        method: 'POST',
        url: `/${SCENARIO_ID}/lines`,
        payload: { weekStart: '2026-04-07', inflowCents: 0, outflowCents: 0 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when weekStart format is invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/${SCENARIO_ID}/lines`,
        payload: { weekStart: 'next-monday', inflowCents: 0, outflowCents: 0 },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when inflowCents is negative', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/${SCENARIO_ID}/lines`,
        payload: { weekStart: '2026-04-07', inflowCents: -100, outflowCents: 0 },
      });
      expect(res.statusCode).toBe(422);
    });

    it('accepts zero inflow and outflow', async () => {
      const scenario = { id: SCENARIO_ID, tenantId: TENANT_ID };
      const line = {
        id: 'line-zero',
        tenantId: TENANT_ID,
        scenarioId: SCENARIO_ID,
        weekStart: '2026-04-07',
        inflowCents: 0,
        outflowCents: 0,
        notes: null,
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([scenario]));
      mocks.mockReturning.mockResolvedValueOnce([line]);

      const res = await app.inject({
        method: 'POST',
        url: `/${SCENARIO_ID}/lines`,
        payload: { weekStart: '2026-04-07', inflowCents: 0, outflowCents: 0 },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // ── GET /bank-accounts ────────────────────────────────────────────

  describe('GET /bank-accounts', () => {
    it('returns list of bank accounts', async () => {
      const account = {
        id: BANK_ID,
        tenantId: TENANT_ID,
        name: 'Operating Checking',
        accountNumber: '****1234',
        institution: 'First National Bank',
        currency: 'USD',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([account]));

      const res = await app.inject({ method: 'GET', url: '/bank-accounts' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[] }>();
      expect(body.data).toHaveLength(1);
    });

    it('returns empty list when no accounts', async () => {
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: '/bank-accounts' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[] }>();
      expect(body.data).toHaveLength(0);
    });
  });

  // ── POST /bank-accounts ───────────────────────────────────────────

  describe('POST /bank-accounts', () => {
    it('creates a bank account and returns 201', async () => {
      const created = {
        id: BANK_ID,
        tenantId: TENANT_ID,
        name: 'Operating Checking',
        accountNumber: null,
        institution: null,
        currency: 'USD',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/bank-accounts',
        payload: { name: 'Operating Checking', currency: 'USD' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ id: string }>().id).toBe(BANK_ID);
    });

    it('accepts optional accountNumber and institution', async () => {
      const created = {
        id: BANK_ID,
        tenantId: TENANT_ID,
        name: 'Payroll',
        accountNumber: '1234567890',
        institution: 'Chase',
        currency: 'USD',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/bank-accounts',
        payload: {
          name: 'Payroll',
          accountNumber: '1234567890',
          institution: 'Chase',
          currency: 'USD',
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 422 when name is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/bank-accounts',
        payload: { currency: 'USD' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when currency is not 3 characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/bank-accounts',
        payload: { name: 'Test', currency: 'US' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── GET /bank-accounts/:id/balances ──────────────────────────────

  describe('GET /bank-accounts/:id/balances', () => {
    it('returns balance list when account exists', async () => {
      const account = { id: BANK_ID, tenantId: TENANT_ID, name: 'Operating' };
      const balance = {
        id: 'bal-1111-2222',
        tenantId: TENANT_ID,
        bankAccountId: BANK_ID,
        balanceDate: '2026-04-11',
        balanceCents: 1500000,
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      let callIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = callIdx++;
        return mocks.makeThenableSelect(idx === 0 ? [account] : [balance]);
      });

      const res = await app.inject({ method: 'GET', url: `/bank-accounts/${BANK_ID}/balances` });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[] }>();
      expect(body.data).toHaveLength(1);
    });

    it('returns 404 when bank account not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([]));

      const res = await app.inject({ method: 'GET', url: `/bank-accounts/${BANK_ID}/balances` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /bank-accounts/:id/balances ─────────────────────────────

  describe('POST /bank-accounts/:id/balances', () => {
    it('records a balance snapshot and returns 201', async () => {
      const account = { id: BANK_ID, tenantId: TENANT_ID };
      const balance = {
        id: 'bal-1111-2222',
        tenantId: TENANT_ID,
        bankAccountId: BANK_ID,
        balanceDate: '2026-04-11',
        balanceCents: 1500000,
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([account]));
      mocks.mockReturning.mockResolvedValueOnce([balance]);

      const res = await app.inject({
        method: 'POST',
        url: `/bank-accounts/${BANK_ID}/balances`,
        payload: { balanceDate: '2026-04-11', balanceCents: 1500000 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ balanceCents: number }>().balanceCents).toBe(1500000);
    });

    it('accepts negative balanceCents (overdraft)', async () => {
      const account = { id: BANK_ID, tenantId: TENANT_ID };
      const balance = {
        id: 'bal-neg',
        tenantId: TENANT_ID,
        bankAccountId: BANK_ID,
        balanceDate: '2026-04-11',
        balanceCents: -50000,
        createdAt: new Date().toISOString(),
        createdBy: USER_ID,
      };

      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([account]));
      mocks.mockReturning.mockResolvedValueOnce([balance]);

      const res = await app.inject({
        method: 'POST',
        url: `/bank-accounts/${BANK_ID}/balances`,
        payload: { balanceDate: '2026-04-11', balanceCents: -50000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 404 when bank account not found', async () => {
      mocks.mockSelect.mockImplementationOnce(() => mocks.makeThenableSelect([]));

      const res = await app.inject({
        method: 'POST',
        url: `/bank-accounts/${BANK_ID}/balances`,
        payload: { balanceDate: '2026-04-11', balanceCents: 1500000 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when balanceDate format is invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bank-accounts/${BANK_ID}/balances`,
        payload: { balanceDate: 'today', balanceCents: 1000 },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when balanceCents is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/bank-accounts/${BANK_ID}/balances`,
        payload: { balanceDate: '2026-04-11' },
      });
      expect(res.statusCode).toBe(422);
    });
  });
});
