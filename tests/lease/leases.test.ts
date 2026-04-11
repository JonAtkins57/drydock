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
import { leaseRoutes } from '../../src/lease/lease.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const LEASE_ID = '33333333-4444-5555-6666-777777777777';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return {
        sub: USER_ID,
        tenantId: TENANT_ID,
        email: 'test@example.com',
        permissions: [] as string[],
      };
    },
  });
  await app.register(leaseRoutes, { prefix: '/' });
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
// Lease Routes Tests
// ════════════════════════════════════════════════════════════════════

describe('Lease Routes', () => {
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
    it('returns paginated lease contracts', async () => {
      const lease = {
        id: LEASE_ID,
        tenantId: TENANT_ID,
        leaseNumber: 'LSE-000001',
        description: 'Office lease',
        leaseType: 'operating',
        status: 'draft',
        commencementDate: new Date('2026-01-01').toISOString(),
        endDate: new Date('2029-01-01').toISOString(),
        leaseTermMonths: 36,
        paymentAmount: 500000,
        paymentFrequency: 'monthly',
        incrementalBorrowingRate: 500,
        rouAssetValue: 17000000,
        leaseLiabilityValue: 17000000,
        createdAt: new Date().toISOString(),
      };
      setupListMock(1, [lease]);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });

    it('returns empty list when no leases', async () => {
      setupListMock(0, []);
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number; totalPages: number } }>();
      expect(body.meta.total).toBe(0);
      expect(body.data).toHaveLength(0);
    });

    it('returns 422 for invalid page param', async () => {
      const res = await app.inject({ method: 'GET', url: '/?page=abc' });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST / ────────────────────────────────────────────────────────

  describe('POST /', () => {
    const validPayload = {
      description: 'Office lease downtown',
      leaseType: 'operating',
      commencementDate: '2026-01-01T00:00:00.000Z',
      endDate: '2029-01-01T00:00:00.000Z',
      leaseTermMonths: 36,
      paymentAmount: 500000,
      paymentFrequency: 'monthly',
      incrementalBorrowingRate: 500,
      rouAssetValue: 17000000,
      leaseLiabilityValue: 17000000,
    };

    it('creates a draft lease contract and returns 201', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'LSE-000001' });
      const created = {
        id: LEASE_ID,
        tenantId: TENANT_ID,
        leaseNumber: 'LSE-000001',
        description: 'Office lease downtown',
        leaseType: 'operating',
        status: 'draft',
        paymentAmount: 500000,
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: validPayload,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ leaseNumber: string; status: string }>().leaseNumber).toBe('LSE-000001');
      expect(res.json<{ status: string }>().status).toBe('draft');
    });

    it('returns 422 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { description: 'Missing dates' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for invalid leaseType', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { ...validPayload, leaseType: 'invalid' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for negative paymentAmount', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { ...validPayload, paymentAmount: -100 },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 500 when number generation fails', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: false, error: { message: 'sequence error' } });

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: validPayload,
      });
      expect(res.statusCode).toBe(500);
    });

    it('accepts optional lessorName and account IDs', async () => {
      const LESSOR_NAME = 'ACME Property Management';
      const ROU_ACCOUNT_ID = '44444444-5555-6666-7777-888888888888';
      const LIAB_ACCOUNT_ID = '55555555-6666-7777-8888-999999999999';

      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'LSE-000002' });
      const created = {
        id: LEASE_ID,
        tenantId: TENANT_ID,
        leaseNumber: 'LSE-000002',
        lessorName: LESSOR_NAME,
        rouAccountId: ROU_ACCOUNT_ID,
        liabilityAccountId: LIAB_ACCOUNT_ID,
        status: 'draft',
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          ...validPayload,
          lessorName: LESSOR_NAME,
          rouAccountId: ROU_ACCOUNT_ID,
          liabilityAccountId: LIAB_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ lessorName: string }>().lessorName).toBe(LESSOR_NAME);
    });
  });
});
