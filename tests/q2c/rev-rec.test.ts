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
    createJournalEntry: vi.fn(),
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

vi.mock('../../src/gl/posting.service.js', () => ({
  createJournalEntry: mocks.createJournalEntry,
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import Fastify from 'fastify';
import { revRecRoutes } from '../../src/q2c/rev-rec.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const CONTRACT_ID = '22222222-3333-4444-5555-666666666666';
const OBLIGATION_ID = '33333333-4444-5555-6666-777777777777';
const SCHEDULE_ID = '44444444-5555-6666-7777-888888888888';
const CUSTOMER_ID = '55555555-6666-7777-8888-999999999999';
const PERIOD_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const REVENUE_ACCOUNT_ID = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
const DEFERRED_ACCOUNT_ID = '88888888-9999-aaaa-bbbb-cccccccccccc';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return {
        sub: USER_ID,
        tenantId: TENANT_ID,
        email: 'test@example.com',
<<<<<<< HEAD
        permissions: [] as string[],
=======
        permissions: [],
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
      };
    },
  });
  await app.register(revRecRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

function setupSelectSequence(responses: (Record<string, unknown> | null)[][]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const rows = responses[idx] ?? [];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['then'] = (resolve: (val: unknown) => void) => resolve(rows);
    return chain;
  });
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
// Rev Rec Contract Routes
// ════════════════════════════════════════════════════════════════════

describe('Rev Rec Contract Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    app = await buildApp();
  });

  describe('GET /contracts', () => {
    it('returns paginated contracts', async () => {
      const contract = {
        id: CONTRACT_ID,
        tenantId: TENANT_ID,
        contractNumber: 'RRC-000001',
        customerId: CUSTOMER_ID,
        status: 'draft',
        totalTransactionPrice: 100000,
        startDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      setupListMock(1, [contract]);

      const res = await app.inject({ method: 'GET', url: '/contracts' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });

    it('returns 422 for invalid query params', async () => {
      const res = await app.inject({ method: 'GET', url: '/contracts?page=bad' });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('GET /contracts/:id', () => {
    it('returns a single contract', async () => {
      const contract = { id: CONTRACT_ID, tenantId: TENANT_ID, contractNumber: 'RRC-000001', status: 'draft' };
      setupSelectSequence([[contract]]);

      const res = await app.inject({ method: 'GET', url: `/contracts/${CONTRACT_ID}` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ contractNumber: string }>().contractNumber).toBe('RRC-000001');
    });

    it('returns 404 when not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'GET', url: `/contracts/${CONTRACT_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /contracts', () => {
    it('creates a draft contract and returns 201', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'RRC-000001' });
      const created = {
        id: CONTRACT_ID,
        tenantId: TENANT_ID,
        contractNumber: 'RRC-000001',
        customerId: CUSTOMER_ID,
        status: 'draft',
        totalTransactionPrice: 50000,
        startDate: new Date().toISOString(),
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/contracts',
        payload: {
          customerId: CUSTOMER_ID,
          totalTransactionPrice: 50000,
          startDate: new Date().toISOString(),
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ contractNumber: string }>().contractNumber).toBe('RRC-000001');
    });

    it('returns 422 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/contracts',
        payload: { customerId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 500 when number generation fails', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: false, error: { message: 'seq error' } });

      const res = await app.inject({
        method: 'POST',
        url: '/contracts',
        payload: {
          customerId: CUSTOMER_ID,
          totalTransactionPrice: 0,
          startDate: new Date().toISOString(),
        },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('PATCH /contracts/:id', () => {
    it('updates a contract', async () => {
      const contract = { id: CONTRACT_ID, tenantId: TENANT_ID, status: 'draft', totalTransactionPrice: 50000 };
      const updated = { ...contract, totalTransactionPrice: 75000 };
      setupSelectSequence([[contract]]);
      mocks.mockReturning.mockResolvedValueOnce([updated]);

      const res = await app.inject({
        method: 'PATCH',
        url: `/contracts/${CONTRACT_ID}`,
        payload: { totalTransactionPrice: 75000 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ totalTransactionPrice: number }>().totalTransactionPrice).toBe(75000);
    });

    it('returns 404 when contract not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({
        method: 'PATCH',
        url: `/contracts/${CONTRACT_ID}`,
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /contracts/:id', () => {
    it('cancels a contract and returns 204', async () => {
      const contract = { id: CONTRACT_ID, tenantId: TENANT_ID, status: 'draft' };
      setupSelectSequence([[contract]]);
      mocks.mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const res = await app.inject({ method: 'DELETE', url: `/contracts/${CONTRACT_ID}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when contract not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'DELETE', url: `/contracts/${CONTRACT_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Rev Rec Obligation Routes
// ════════════════════════════════════════════════════════════════════

describe('Rev Rec Obligation Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    app = await buildApp();
  });

  describe('GET /obligations', () => {
    it('returns paginated obligations', async () => {
      const obligation = {
        id: OBLIGATION_ID,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        description: 'SaaS subscription',
        status: 'not_started',
        allocatedPrice: 100000,
        recognizedToDate: 0,
      };
      setupListMock(1, [obligation]);

      const res = await app.inject({ method: 'GET', url: '/obligations' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
    });
  });

  describe('POST /obligations', () => {
    it('creates an obligation and returns 201', async () => {
      const contract = { id: CONTRACT_ID, tenantId: TENANT_ID, status: 'active' };
      const obligation = {
        id: OBLIGATION_ID,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        description: 'SaaS subscription',
        recognitionMethod: 'over_time',
        status: 'not_started',
        allocatedPrice: 100000,
        recognizedToDate: 0,
      };
      setupSelectSequence([[contract]]);
      mocks.mockReturning.mockResolvedValueOnce([obligation]);

      const res = await app.inject({
        method: 'POST',
        url: '/obligations',
        payload: {
          contractId: CONTRACT_ID,
          description: 'SaaS subscription',
          recognitionMethod: 'over_time',
          allocatedPrice: 100000,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ status: string }>().status).toBe('not_started');
    });

    it('returns 404 when contract not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({
        method: 'POST',
        url: '/obligations',
        payload: {
          contractId: CONTRACT_ID,
          description: 'Test',
          recognitionMethod: 'point_in_time',
          allocatedPrice: 0,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 for invalid recognition method', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/obligations',
        payload: {
          contractId: CONTRACT_ID,
          description: 'Test',
          recognitionMethod: 'invalid_method',
        },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('POST /obligations/:id/actions/recognize', () => {
    it('posts GL and returns updated obligation and schedule', async () => {
      const obligation = {
        id: OBLIGATION_ID,
        tenantId: TENANT_ID,
        contractId: CONTRACT_ID,
        status: 'in_progress',
        recognizedToDate: 0,
      };
      const schedule = {
        id: SCHEDULE_ID,
        obligationId: OBLIGATION_ID,
        scheduledAmount: 10000,
        status: 'scheduled',
      };
      const openPeriod = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open' };

      setupSelectSequence([[obligation], [schedule], [openPeriod]]);
      mocks.createJournalEntry.mockResolvedValueOnce({ ok: true, value: { id: 'je-1' } });
      mocks.mockReturning
        .mockResolvedValueOnce([{ ...schedule, status: 'recognized', recognizedAmount: 10000 }])
        .mockResolvedValueOnce([{ ...obligation, recognizedToDate: 10000 }]);

      const res = await app.inject({
        method: 'POST',
        url: `/obligations/${OBLIGATION_ID}/actions/recognize`,
        payload: {
          scheduleId: SCHEDULE_ID,
          revenueAccountId: REVENUE_ACCOUNT_ID,
          deferredRevenueAccountId: DEFERRED_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(mocks.createJournalEntry).toHaveBeenCalledOnce();
    });

    it('returns 422 when obligation is satisfied', async () => {
      const obligation = { id: OBLIGATION_ID, tenantId: TENANT_ID, status: 'satisfied' };
      setupSelectSequence([[obligation]]);

      const res = await app.inject({
        method: 'POST',
        url: `/obligations/${OBLIGATION_ID}/actions/recognize`,
        payload: {
          scheduleId: SCHEDULE_ID,
          revenueAccountId: REVENUE_ACCOUNT_ID,
          deferredRevenueAccountId: DEFERRED_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 404 when obligation not found', async () => {
      setupSelectSequence([[]]);

      const res = await app.inject({
        method: 'POST',
        url: `/obligations/${OBLIGATION_ID}/actions/recognize`,
        payload: {
          scheduleId: SCHEDULE_ID,
          revenueAccountId: REVENUE_ACCOUNT_ID,
          deferredRevenueAccountId: DEFERRED_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 500 when GL posting fails', async () => {
      const obligation = { id: OBLIGATION_ID, tenantId: TENANT_ID, status: 'not_started' };
      const schedule = { id: SCHEDULE_ID, obligationId: OBLIGATION_ID, scheduledAmount: 5000, status: 'scheduled' };
      const openPeriod = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open' };

      setupSelectSequence([[obligation], [schedule], [openPeriod]]);
      mocks.createJournalEntry.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL', message: 'GL error' } });

      const res = await app.inject({
        method: 'POST',
        url: `/obligations/${OBLIGATION_ID}/actions/recognize`,
        payload: {
          scheduleId: SCHEDULE_ID,
          revenueAccountId: REVENUE_ACCOUNT_ID,
          deferredRevenueAccountId: DEFERRED_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(500);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Rev Rec Schedule Routes
// ════════════════════════════════════════════════════════════════════

describe('Rev Rec Schedule Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    app = await buildApp();
  });

  describe('GET /schedules', () => {
    it('returns paginated schedules', async () => {
      const schedule = {
        id: SCHEDULE_ID,
        tenantId: TENANT_ID,
        obligationId: OBLIGATION_ID,
        scheduledDate: new Date().toISOString(),
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        scheduledAmount: 10000,
        recognizedAmount: 0,
        status: 'scheduled',
      };
      setupListMock(1, [schedule]);

      const res = await app.inject({ method: 'GET', url: '/schedules' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
    });
  });

  describe('POST /schedules', () => {
    it('creates a schedule line and returns 201', async () => {
      const obligation = { id: OBLIGATION_ID, tenantId: TENANT_ID, status: 'not_started' };
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 86400000 * 30).toISOString();
      const scheduleRow = {
        id: SCHEDULE_ID,
        tenantId: TENANT_ID,
        obligationId: OBLIGATION_ID,
        scheduledDate: now,
        periodStart: now,
        periodEnd: end,
        scheduledAmount: 10000,
        recognizedAmount: 0,
        status: 'scheduled',
      };
      setupSelectSequence([[obligation]]);
      mocks.mockReturning.mockResolvedValueOnce([scheduleRow]);

      const res = await app.inject({
        method: 'POST',
        url: '/schedules',
        payload: {
          obligationId: OBLIGATION_ID,
          scheduledDate: now,
          periodStart: now,
          periodEnd: end,
          scheduledAmount: 10000,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ status: string }>().status).toBe('scheduled');
    });

    it('returns 404 when obligation not found', async () => {
      setupSelectSequence([[]]);
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 86400000 * 30).toISOString();

      const res = await app.inject({
        method: 'POST',
        url: '/schedules',
        payload: {
          obligationId: OBLIGATION_ID,
          scheduledDate: now,
          periodStart: now,
          periodEnd: end,
          scheduledAmount: 5000,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/schedules',
        payload: { obligationId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(422);
    });
  });
});
