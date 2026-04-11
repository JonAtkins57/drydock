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
import { creditMemoRoutes } from '../../src/q2c/credit-memos.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const MEMO_ID = '33333333-4444-5555-6666-777777777777';
const CUSTOMER_ID = '22222222-3333-4444-5555-666666666666';
const PERIOD_ID = '44444444-5555-6666-7777-888888888888';
const AR_ACCOUNT_ID = '55555555-6666-7777-8888-999999999999';
const DEBIT_ACCOUNT_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const CREDIT_ACCOUNT_ID = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

async function buildApp() {
  const app = Fastify();
  // Inject currentUser so route handlers can read it
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
  await app.register(creditMemoRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

// ── Helper: setup sequential select calls ─────────────────────────

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
// Credit Memo Route Tests
// ════════════════════════════════════════════════════════════════════

describe('Credit Memo Routes', () => {
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
    it('returns paginated credit memos', async () => {
      const memo = {
        id: MEMO_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        memoNumber: 'CM-000001',
        status: 'draft',
        totalAmount: 5000,
        createdAt: new Date().toISOString(),
      };
      setupListMock(1, [memo]);

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });
  });

  // ── POST / ────────────────────────────────────────────────────────

  describe('POST /', () => {
    it('creates a draft credit memo and returns 201', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'CM-000001' });
      const created = {
        id: MEMO_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        memoNumber: 'CM-000001',
        status: 'draft',
        totalAmount: 10000,
        createdBy: USER_ID,
      };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { customerId: CUSTOMER_ID, totalAmount: 10000, reason: 'Overcharge' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ memoNumber: string }>().memoNumber).toBe('CM-000001');
    });

    it('returns 422 for invalid body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { customerId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 500 when number generation fails', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: false, error: { message: 'seq error' } });

      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: { customerId: CUSTOMER_ID, totalAmount: 5000 },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /:id/actions/submit ───────────────────────────────────────

  describe('POST /:id/actions/submit', () => {
    it('transitions draft → pending_approval', async () => {
      const draft = { id: MEMO_ID, tenantId: TENANT_ID, status: 'draft' };
      const pending = { ...draft, status: 'pending_approval' };
      setupSelectSequence([[draft]]);
      mocks.mockReturning.mockResolvedValueOnce([pending]);

      const res = await app.inject({ method: 'POST', url: `/${MEMO_ID}/actions/submit` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('pending_approval');
    });

    it('returns 404 when memo not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'POST', url: `/${MEMO_ID}/actions/submit` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when memo is not in draft status', async () => {
      const memo = { id: MEMO_ID, tenantId: TENANT_ID, status: 'pending_approval' };
      setupSelectSequence([[memo]]);
      const res = await app.inject({ method: 'POST', url: `/${MEMO_ID}/actions/submit` });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /:id/actions/approve ─────────────────────────────────────

  describe('POST /:id/actions/approve', () => {
    it('approves and posts GL, returns approved memo', async () => {
      const memo = {
        id: MEMO_ID,
        tenantId: TENANT_ID,
        status: 'pending_approval',
        totalAmount: 5000,
        memoNumber: 'CM-000001',
        arAccountId: null,
      };
      const openPeriod = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open' };
      const approved = { ...memo, status: 'approved', approvedBy: USER_ID };

      setupSelectSequence([[memo], [openPeriod]]);
      mocks.createJournalEntry.mockResolvedValueOnce({ ok: true, value: { id: 'je-1' } });
      mocks.mockReturning.mockResolvedValueOnce([approved]);

      const res = await app.inject({
        method: 'POST',
        url: `/${MEMO_ID}/actions/approve`,
        payload: {
          periodId: PERIOD_ID,
          debitAccountId: DEBIT_ACCOUNT_ID,
          creditAccountId: CREDIT_ACCOUNT_ID,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('approved');
      expect(mocks.createJournalEntry).toHaveBeenCalledOnce();
    });

    it('returns 500 when GL posting fails', async () => {
      const memo = {
        id: MEMO_ID,
        tenantId: TENANT_ID,
        status: 'pending_approval',
        totalAmount: 5000,
        memoNumber: 'CM-000001',
        arAccountId: AR_ACCOUNT_ID,
      };
      const openPeriod = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open' };
      setupSelectSequence([[memo], [openPeriod], []]);
      mocks.createJournalEntry.mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL', message: 'GL error' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/${MEMO_ID}/actions/approve`,
        payload: { periodId: PERIOD_ID },
      });
      expect(res.statusCode).toBe(500);
    });

    it('returns 422 when memo is not in pending_approval status', async () => {
      const memo = { id: MEMO_ID, tenantId: TENANT_ID, status: 'draft', totalAmount: 5000 };
      setupSelectSequence([[memo]]);
      const res = await app.inject({
        method: 'POST',
        url: `/${MEMO_ID}/actions/approve`,
        payload: { periodId: PERIOD_ID, debitAccountId: DEBIT_ACCOUNT_ID, creditAccountId: CREDIT_ACCOUNT_ID },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /:id/actions/reject ──────────────────────────────────────

  describe('POST /:id/actions/reject', () => {
    it('rejects a pending_approval memo', async () => {
      const memo = { id: MEMO_ID, tenantId: TENANT_ID, status: 'pending_approval' };
      const rejected = { ...memo, status: 'rejected' };
      setupSelectSequence([[memo]]);
      mocks.mockReturning.mockResolvedValueOnce([rejected]);

      const res = await app.inject({ method: 'POST', url: `/${MEMO_ID}/actions/reject` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('rejected');
    });

    it('returns 404 when memo not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'POST', url: `/${MEMO_ID}/actions/reject` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── DELETE /:id ───────────────────────────────────────────────────

  describe('DELETE /:id', () => {
    it('voids a draft memo and returns 204', async () => {
      const memo = { id: MEMO_ID, tenantId: TENANT_ID, status: 'draft' };
      setupSelectSequence([[memo]]);
      mocks.mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const res = await app.inject({ method: 'DELETE', url: `/${MEMO_ID}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when memo not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'DELETE', url: `/${MEMO_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });
});
