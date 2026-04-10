import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockLimit = vi.fn();

  function makeChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = mockLimit.mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const selectChain = makeChain();

  function resetChains() {
    (selectChain['where'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    (selectChain['from'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    (selectChain['orderBy'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    mockLimit.mockReturnValue(selectChain);
  }

  return {
    mockLimit,
    selectChain,
    resetChains,
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockSendEmail: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

vi.mock('../../src/core/email.service.js', () => ({
  sendEmail: mocks.mockSendEmail,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { getStatement, sendStatement } from '../../src/q2c/statement.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CUSTOMER_ID = '22222222-3333-4444-5555-666666666666';
const CONTACT_ID = '33333333-4444-5555-6666-777777777777';

// ── Helpers ────────────────────────────────────────────────────────

/** Set up select to return different rows per call (sequential calls). */
function setupSelectSequence(responses: unknown[][]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const responseRows = responses[callIdx++] ?? [];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockResolvedValue(responseRows);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

function makeInvoice(overrides: Partial<{
  id: string;
  invoiceNumber: string;
  dueDate: Date;
  invoiceDate: Date;
  totalAmount: number;
  paidAmount: number;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'inv-1',
    invoiceNumber: overrides.invoiceNumber ?? 'INV-000001',
    dueDate: overrides.dueDate ?? new Date('2026-04-01'),
    invoiceDate: overrides.invoiceDate ?? new Date('2026-03-01'),
    totalAmount: overrides.totalAmount ?? 10000,
    paidAmount: overrides.paidAmount ?? 0,
    status: overrides.status ?? 'sent',
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
  };
}

// ════════════════════════════════════════════════════════════════════
// Statement Service Tests
// ════════════════════════════════════════════════════════════════════

describe('Statement Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
  });

  // ── getStatement ─────────────────────────────────────────────────

  describe('getStatement', () => {
    it('returns NOT_FOUND when customer does not exist for tenant', async () => {
      // customer query returns empty
      setupSelectSequence([[]]);

      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2026-01-01', '2026-04-10');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('returns an empty statement when no invoices exist in range', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }], // customer
        [],                                         // invoices
      ]);

      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2026-01-01', '2026-04-10');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.open_invoices).toHaveLength(0);
        expect(result.value.total_outstanding).toBe(0);
        expect(result.value.customer_name).toBe('Acme Corp');
        expect(result.value.from).toBe('2026-01-01');
        expect(result.value.to).toBe('2026-04-10');
        expect(result.value.truncated).toBe(false);
      }
    });

    it('returns open invoices with correct outstanding amounts', async () => {
      const inv1 = makeInvoice({ id: 'inv-1', totalAmount: 10000, paidAmount: 2500, dueDate: new Date('2026-03-15') });
      const inv2 = makeInvoice({ id: 'inv-2', totalAmount: 5000, paidAmount: 0, dueDate: new Date('2026-04-01') });

      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }],
        [inv1, inv2],
      ]);

      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2026-01-01', '2026-04-10');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.open_invoices).toHaveLength(2);
        expect(result.value.total_outstanding).toBe(12500); // 7500 + 5000
        const mapped = result.value.open_invoices.find((i) => i.id === 'inv-1');
        expect(mapped?.outstanding).toBe(7500);
        expect(mapped?.paidAmount).toBe(2500);
        expect(mapped?.totalAmount).toBe(10000);
      }
    });

    it('sets truncated=true when more than 500 invoices are returned', async () => {
      // Return 501 invoices to trigger truncation detection
      const rows = Array.from({ length: 501 }, (_, i) =>
        makeInvoice({ id: `inv-${i}`, invoiceNumber: `INV-${String(i).padStart(6, '0')}` }),
      );

      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }],
        rows,
      ]);

      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2026-01-01', '2026-04-10');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.truncated).toBe(true);
        expect(result.value.open_invoices).toHaveLength(500);
      }
    });

    it('includes statement metadata fields', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Tillster Inc' }],
        [],
      ]);

      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2026-02-01', '2026-04-10');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.customer_id).toBe(CUSTOMER_ID);
        expect(result.value.statement_date).toBe('2026-04-10');
        expect(result.value.credit_memos).toEqual([]);
        expect(result.value.unapplied_payments).toEqual([]);
      }
    });
  });

  // ── computeAgingBuckets (via getStatement) ────────────────────────

  describe('computeAgingBuckets', () => {
    async function getAging(invoiceRows: ReturnType<typeof makeInvoice>[], toDate: string) {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }],
        invoiceRows,
      ]);
      const result = await getStatement(TENANT_ID, CUSTOMER_ID, '2020-01-01', toDate);
      if (!result.ok) throw new Error('getStatement failed');
      return result.value.aging_summary;
    }

    it('places invoice with dueDate > toDate in current bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-05-01'), totalAmount: 1000, paidAmount: 0 });
      const aging = await getAging([inv], '2026-04-10');
      expect(aging.current.count).toBe(1);
      expect(aging.current.totalOutstanding).toBe(1000);
    });

    it('places invoice due exactly on toDate in current bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-04-10'), totalAmount: 2000, paidAmount: 0 });
      const aging = await getAging([inv], '2026-04-10');
      expect(aging.current.count).toBe(1);
    });

    it('places invoice 1-30 days overdue in 1_30 bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-03-20'), totalAmount: 3000, paidAmount: 0 });
      // toDate=2026-04-10, dueDate=2026-03-20 → 21 days overdue
      const aging = await getAging([inv], '2026-04-10');
      expect(aging['1_30'].count).toBe(1);
      expect(aging['1_30'].totalOutstanding).toBe(3000);
    });

    it('places invoice 31-60 days overdue in 31_60 bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-02-09'), totalAmount: 4000, paidAmount: 0 });
      // toDate=2026-04-10, dueDate=2026-02-09 → 60 days overdue
      const aging = await getAging([inv], '2026-04-10');
      expect(aging['31_60'].count).toBe(1);
    });

    it('places invoice 61-90 days overdue in 61_90 bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-01-10'), totalAmount: 5000, paidAmount: 0 });
      // toDate=2026-04-10, dueDate=2026-01-10 → 90 days overdue
      const aging = await getAging([inv], '2026-04-10');
      expect(aging['61_90'].count).toBe(1);
    });

    it('places invoice 91+ days overdue in 90plus bucket', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-01-01'), totalAmount: 6000, paidAmount: 0 });
      // toDate=2026-04-10, dueDate=2026-01-01 → 99 days overdue
      const aging = await getAging([inv], '2026-04-10');
      expect(aging['90plus'].count).toBe(1);
      expect(aging['90plus'].totalOutstanding).toBe(6000);
    });

    it('correctly accounts for partial payments in outstanding amounts', async () => {
      const inv = makeInvoice({ dueDate: new Date('2026-03-01'), totalAmount: 8000, paidAmount: 3000 });
      const aging = await getAging([inv], '2026-04-10');
      // 40 days overdue → 31_60
      expect(aging['31_60'].totalOutstanding).toBe(5000);
      expect(aging['31_60'].totalAmount).toBe(8000);
    });

    it('distributes multiple invoices across correct buckets', async () => {
      const rows = [
        makeInvoice({ id: 'i1', dueDate: new Date('2026-05-01'), totalAmount: 1000, paidAmount: 0 }), // current
        makeInvoice({ id: 'i2', dueDate: new Date('2026-03-20'), totalAmount: 2000, paidAmount: 0 }), // 1_30
        makeInvoice({ id: 'i3', dueDate: new Date('2026-01-01'), totalAmount: 3000, paidAmount: 0 }), // 90plus
      ];
      const aging = await getAging(rows, '2026-04-10');
      expect(aging.current.count).toBe(1);
      expect(aging['1_30'].count).toBe(1);
      expect(aging['90plus'].count).toBe(1);
      expect(aging['31_60'].count).toBe(0);
      expect(aging['61_90'].count).toBe(0);
    });
  });

  // ── sendStatement ─────────────────────────────────────────────────

  describe('sendStatement', () => {
    it('returns NOT_FOUND when customer does not exist', async () => {
      setupSelectSequence([[]]);

      const result = await sendStatement(TENANT_ID, CUSTOMER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('returns VALIDATION error when no email provided and no primary contact', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }], // customer
        [],                                         // contacts (empty)
      ]);

      const result = await sendStatement(TENANT_ID, CUSTOMER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
      }
    });

    it('uses provided toEmail directly without querying contacts', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }], // customer only — no second select
      ]);
      mocks.mockSendEmail.mockResolvedValue({ ok: true, value: { messageId: 'msg-abc' } });

      const result = await sendStatement(TENANT_ID, CUSTOMER_ID, 'billing@acme.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sentTo).toBe('billing@acme.com');
        expect(result.value.messageId).toBe('msg-abc');
      }
      // Should only have called select once (customer lookup), not a second time for contacts
      expect(mocks.mockSelect).toHaveBeenCalledTimes(1);
    });

    it('resolves email from primary contact when no toEmail provided', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }],
        [{ id: CONTACT_ID, email: 'ap@acme.com' }],
      ]);
      mocks.mockSendEmail.mockResolvedValue({ ok: true, value: { messageId: 'msg-xyz' } });

      const result = await sendStatement(TENANT_ID, CUSTOMER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sentTo).toBe('ap@acme.com');
      }
    });

    it('returns error when SES send fails', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Acme Corp' }],
        [{ id: CONTACT_ID, email: 'ap@acme.com' }],
      ]);
      mocks.mockSendEmail.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'SES throttled' } });

      const result = await sendStatement(TENANT_ID, CUSTOMER_ID);

      expect(result.ok).toBe(false);
    });

    it('passes correct subject line with customer name', async () => {
      setupSelectSequence([
        [{ id: CUSTOMER_ID, name: 'Tillster Inc' }],
      ]);
      mocks.mockSendEmail.mockResolvedValue({ ok: true, value: { messageId: 'msg-1' } });

      await sendStatement(TENANT_ID, CUSTOMER_ID, 'billing@tillster.com');

      expect(mocks.mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'billing@tillster.com',
          subject: expect.stringContaining('Tillster Inc'),
        }),
      );
    });
  });
});
