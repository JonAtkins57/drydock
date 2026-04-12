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
    createJournalEntry: vi.fn(),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

vi.mock('../../src/gl/posting.service.js', () => ({
  createJournalEntry: mocks.createJournalEntry,
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import Fastify from 'fastify';
import { budgetingRoutes } from '../../src/budgeting/budgeting.routes.js';

// ── Constants ──────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID   = '11111111-2222-3333-4444-555555555555';
const BUDGET_ID = '33333333-4444-5555-6666-777777777777';
const PERIOD_ID = '44444444-5555-6666-7777-888888888888';
const CTRL_ACCT = '55555555-6666-7777-8888-999999999999';
const EXPENSE_ACCT = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const DEPT_ID   = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

function makeBudget(status = 'draft') {
  return {
    id: BUDGET_ID,
    tenantId: TENANT_ID,
    fiscalYear: 2026,
    name: 'FY2026 Base',
    scenario: 'base',
    status,
    notes: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: USER_ID,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
  };
}

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return { sub: USER_ID, tenantId: TENANT_ID, email: 'test@example.com', permissions: [] as string[] };
    },
  });
  await app.register(budgetingRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

// Sequential select mock — each call returns rows[i]
function setupSelectSequence(responses: (Record<string, unknown> | null)[][]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const rows = responses[idx] ?? [];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockImplementation(() => {
      const limitChain: Record<string, ReturnType<typeof vi.fn>> = {};
      limitChain['where'] = vi.fn().mockReturnValue(limitChain);
      limitChain['then'] = (resolve: (val: unknown) => void) => resolve(rows);
      return limitChain;
    });
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['then'] = (resolve: (val: unknown) => void) => resolve(rows);
    return chain;
  });
}

// ════════════════════════════════════════════════════════════════════
// Budget Approval Workflow Tests
// ════════════════════════════════════════════════════════════════════

describe('Budget Approval Workflow', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
    app = await buildApp();
  });

  // ── POST /:id/actions/submit ──────────────────────────────────────

  describe('POST /:id/actions/submit', () => {
    it('transitions draft → pending_approval', async () => {
      const draft = makeBudget('draft');
      const pending = { ...draft, status: 'pending_approval' };
      setupSelectSequence([[draft]]);
      mocks.mockReturning.mockResolvedValueOnce([pending]);

      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/submit` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('pending_approval');
      expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit' }));
    });

    it('returns 404 when budget not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/submit` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when budget is not draft', async () => {
      setupSelectSequence([[makeBudget('pending_approval')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/submit` });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /:id/actions/approve ─────────────────────────────────────

  describe('POST /:id/actions/approve', () => {
    it('transitions pending_approval → approved without GL when no account provided', async () => {
      const pending = makeBudget('pending_approval');
      const approved = { ...pending, status: 'approved', approvedBy: USER_ID };
      setupSelectSequence([[pending]]);
      mocks.mockReturning.mockResolvedValueOnce([approved]);

      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/approve`, payload: {} });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('approved');
      expect(mocks.createJournalEntry).not.toHaveBeenCalled();
      expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }));
    });

    it('posts GL when budgetControlAccountId + open period provided', async () => {
      const pending = makeBudget('pending_approval');
      const approved = { ...pending, status: 'approved', approvedBy: USER_ID };
      const period = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open', startDate: '2026-01-01' };
      const line = { id: 'line-1', tenantId: TENANT_ID, budgetId: BUDGET_ID, accountId: EXPENSE_ACCT, departmentId: DEPT_ID, amountCents: 50000, description: null };

      setupSelectSequence([[pending], [period], [line]]);
      mocks.createJournalEntry.mockResolvedValueOnce({ ok: true, value: { id: 'je-001' } });
      mocks.mockReturning.mockResolvedValueOnce([approved]);

      const res = await app.inject({
        method: 'POST',
        url: `/${BUDGET_ID}/actions/approve`,
        payload: { periodId: PERIOD_ID, budgetControlAccountId: CTRL_ACCT },
      });
      expect(res.statusCode).toBe(200);
      expect(mocks.createJournalEntry).toHaveBeenCalledOnce();
      const jeCall = mocks.createJournalEntry.mock.calls[0][1];
      expect(jeCall.sourceModule).toBe('budget');
      expect(jeCall.lines).toHaveLength(2); // 1 expense debit + 1 control credit
    });

    it('returns 422 when no open period and GL account provided', async () => {
      const pending = makeBudget('pending_approval');
      setupSelectSequence([[pending], []]); // no open period
      const res = await app.inject({
        method: 'POST',
        url: `/${BUDGET_ID}/actions/approve`,
        payload: { budgetControlAccountId: CTRL_ACCT },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 500 when GL posting fails', async () => {
      const pending = makeBudget('pending_approval');
      const period = { id: PERIOD_ID, tenantId: TENANT_ID, status: 'open', startDate: '2026-01-01' };
      const line = { id: 'line-1', tenantId: TENANT_ID, budgetId: BUDGET_ID, accountId: EXPENSE_ACCT, departmentId: DEPT_ID, amountCents: 50000, description: null };
      setupSelectSequence([[pending], [period], [line]]);
      mocks.createJournalEntry.mockResolvedValueOnce({ ok: false, error: { message: 'GL error' } });

      const res = await app.inject({
        method: 'POST',
        url: `/${BUDGET_ID}/actions/approve`,
        payload: { periodId: PERIOD_ID, budgetControlAccountId: CTRL_ACCT },
      });
      expect(res.statusCode).toBe(500);
    });

    it('returns 404 when budget not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/approve`, payload: {} });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when budget is not pending_approval', async () => {
      setupSelectSequence([[makeBudget('draft')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/approve`, payload: {} });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /:id/actions/reject ──────────────────────────────────────

  describe('POST /:id/actions/reject', () => {
    it('transitions pending_approval → rejected', async () => {
      const pending = makeBudget('pending_approval');
      const rejected = { ...pending, status: 'rejected', rejectedBy: USER_ID };
      setupSelectSequence([[pending]]);
      mocks.mockReturning.mockResolvedValueOnce([rejected]);

      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/reject` });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('rejected');
      expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject' }));
    });

    it('returns 404 when budget not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/reject` });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when budget is not pending_approval', async () => {
      setupSelectSequence([[makeBudget('approved')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/reject` });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── DELETE /:id (void) ────────────────────────────────────────────

  describe('DELETE /:id', () => {
    it('voids a draft budget', async () => {
      setupSelectSequence([[makeBudget('draft')]]);

      const res = await app.inject({ method: 'DELETE', url: `/${BUDGET_ID}` });
      expect(res.statusCode).toBe(204);
      expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'void' }));
    });

    it('voids a rejected budget', async () => {
      setupSelectSequence([[makeBudget('rejected')]]);

      const res = await app.inject({ method: 'DELETE', url: `/${BUDGET_ID}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 422 when voiding an approved budget', async () => {
      setupSelectSequence([[makeBudget('approved')]]);
      const res = await app.inject({ method: 'DELETE', url: `/${BUDGET_ID}` });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when voiding a pending_approval budget', async () => {
      setupSelectSequence([[makeBudget('pending_approval')]]);
      const res = await app.inject({ method: 'DELETE', url: `/${BUDGET_ID}` });
      expect(res.statusCode).toBe(422);
    });

    it('returns 404 when budget not found', async () => {
      setupSelectSequence([[]]);
      const res = await app.inject({ method: 'DELETE', url: `/${BUDGET_ID}` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── State machine: invalid transitions ───────────────────────────

  describe('Invalid transition guards', () => {
    it('cannot submit an already-approved budget', async () => {
      setupSelectSequence([[makeBudget('approved')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/submit` });
      expect(res.statusCode).toBe(422);
    });

    it('cannot approve a draft (must submit first)', async () => {
      setupSelectSequence([[makeBudget('draft')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/approve`, payload: {} });
      expect(res.statusCode).toBe(422);
    });

    it('cannot reject a draft (must submit first)', async () => {
      setupSelectSequence([[makeBudget('draft')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/reject` });
      expect(res.statusCode).toBe(422);
    });

    it('cannot approve a voided budget', async () => {
      setupSelectSequence([[makeBudget('voided')]]);
      const res = await app.inject({ method: 'POST', url: `/${BUDGET_ID}/actions/approve`, payload: {} });
      expect(res.statusCode).toBe(422);
    });
  });
});
