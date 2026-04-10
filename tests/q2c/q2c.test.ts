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
  const deleteChain = makeChain();

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain, deleteChain]) {
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
    deleteChain,
    resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    mockDelete: vi.fn().mockReturnValue(deleteChain),
    logAction: vi.fn().mockResolvedValue(undefined),
    generateNumber: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
  },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { quoteService } from '../../src/q2c/quotes.service.js';
import { orderService } from '../../src/q2c/orders.service.js';
import { invoiceService } from '../../src/q2c/invoices.service.js';
import { billingService } from '../../src/q2c/billing.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const CUSTOMER_ID = '22222222-3333-4444-5555-666666666666';
const QUOTE_ID = '33333333-4444-5555-6666-777777777777';
const ORDER_ID = '44444444-5555-6666-7777-888888888888';
const INVOICE_ID = '55555555-6666-7777-8888-999999999999';
const PLAN_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

// ── Helper: setup select for count + data pattern (Promise.all) ────

function setupListMock(countValue: number, dataRows: Record<string, unknown>[]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['groupBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);

    if (idx === 0) {
      chain['then'] = (resolve: (val: unknown) => void) => resolve([{ count: countValue }]);
    } else {
      chain['then'] = (resolve: (val: unknown) => void) => resolve(dataRows);
    }
    return chain;
  });
}

// ════════════════════════════════════════════════════════════════════
// Quote Tests
// ════════════════════════════════════════════════════════════════════

describe('Quote Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.mockDelete.mockReturnValue(mocks.deleteChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createQuote', () => {
    it('should create a quote with lines and auto-number', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'QUOT-000001' });

      const mockQuote = {
        id: QUOTE_ID,
        tenantId: TENANT_ID,
        quoteNumber: 'QUOT-000001',
        customerId: CUSTOMER_ID,
        name: 'Test Quote',
        status: 'draft',
        totalAmount: 10000,
        version: 1,
        parentQuoteId: null,
        createdBy: USER_ID,
      };

      const mockLines = [
        { id: 'line-1', quoteId: QUOTE_ID, lineNumber: 1, description: 'Widget', quantity: 10, unitPrice: 1000, amount: 10000 },
      ];

      // insert quote -> returning
      mocks.mockReturning
        .mockResolvedValueOnce([mockQuote])
        // insert lines -> returning
        .mockResolvedValueOnce(mockLines);

      const result = await quoteService.createQuote(TENANT_ID, {
        customerId: CUSTOMER_ID,
        name: 'Test Quote',
        lines: [
          { description: 'Widget', quantity: 10, unitPrice: 1000 },
        ],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.quoteNumber).toBe('QUOT-000001');
        expect(result.value.status).toBe('draft');
        expect(result.value.totalAmount).toBe(10000);
        expect(result.value.lines).toHaveLength(1);
      }
      expect(mocks.generateNumber).toHaveBeenCalledWith(TENANT_ID, 'quote');
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          entityType: 'quote',
        }),
      );
    });
  });

  describe('getQuote', () => {
    it('should return a quote with lines', async () => {
      const mockQuote = {
        id: QUOTE_ID,
        tenantId: TENANT_ID,
        name: 'Test Quote',
        status: 'draft',
      };
      const mockLines = [
        { id: 'line-1', quoteId: QUOTE_ID, description: 'Widget', quantity: 10, unitPrice: 1000, amount: 10000 },
      ];

      // First select (quote) -> limit returns quote
      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['orderBy'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockQuote]);
          chain['limit'] = vi.fn().mockReturnValue(chain);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve(mockLines);
        }
        return chain;
      });

      const result = await quoteService.getQuote(TENANT_ID, QUOTE_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(QUOTE_ID);
        expect(result.value.lines).toHaveLength(1);
      }
    });

    it('should return NOT_FOUND for missing quote', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await quoteService.getQuote(TENANT_ID, QUOTE_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('sendQuote', () => {
    it('should transition draft quote to sent', async () => {
      const mockQuote = {
        id: QUOTE_ID,
        tenantId: TENANT_ID,
        name: 'Test Quote',
        status: 'draft',
      };

      // getQuote: select quote -> limit, select lines
      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockQuote]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const sentQuote = { ...mockQuote, status: 'sent' };
      mocks.mockReturning.mockResolvedValueOnce([sentQuote]);

      const result = await quoteService.sendQuote(TENANT_ID, QUOTE_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('sent');
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'send', entityType: 'quote' }),
      );
    });

    it('should reject sending a non-draft quote', async () => {
      const mockQuote = {
        id: QUOTE_ID,
        tenantId: TENANT_ID,
        status: 'sent',
      };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockQuote]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const result = await quoteService.sendQuote(TENANT_ID, QUOTE_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('acceptQuote', () => {
    it('should accept a sent quote and auto-create sales order', async () => {
      const mockQuote = {
        id: QUOTE_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        name: 'Test Quote',
        status: 'sent',
        totalAmount: 10000,
        notes: null,
      };
      const mockLines = [
        { id: 'line-1', quoteId: QUOTE_ID, lineNumber: 1, description: 'Widget', quantity: 10, unitPrice: 1000, amount: 10000, itemId: null },
      ];

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockQuote]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve(mockLines);
        }
        return chain;
      });

      mocks.generateNumber
        .mockResolvedValueOnce({ ok: true, value: 'SALE-000001' });

      const acceptedQuote = { ...mockQuote, status: 'accepted' };
      const mockOrder = {
        id: ORDER_ID,
        tenantId: TENANT_ID,
        orderNumber: 'SALE-000001',
        customerId: CUSTOMER_ID,
        quoteId: QUOTE_ID,
        status: 'draft',
        totalAmount: 10000,
      };

      mocks.mockReturning
        .mockResolvedValueOnce([acceptedQuote])  // update quote
        .mockResolvedValueOnce([mockOrder])       // insert order
        .mockResolvedValueOnce([]);               // insert order lines

      const result = await quoteService.acceptQuote(TENANT_ID, QUOTE_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.quote.status).toBe('accepted');
        expect(result.value.salesOrder.orderNumber).toBe('SALE-000001');
        expect(result.value.salesOrder.quoteId).toBe(QUOTE_ID);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'accept',
          entityType: 'quote',
        }),
      );
    });
  });

  describe('listQuotes', () => {
    it('should return paginated quotes', async () => {
      const mockQuotes = [
        { id: QUOTE_ID, name: 'Test Quote', status: 'draft', totalAmount: 10000 },
      ];
      setupListMock(1, mockQuotes);

      const result = await quoteService.listQuotes(TENANT_ID, {
        page: 1,
        pageSize: 50,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.meta.total).toBe(1);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Order Tests
// ════════════════════════════════════════════════════════════════════

describe('Order Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createOrder', () => {
    it('should create an order with lines', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'SALE-000001' });

      const mockOrder = {
        id: ORDER_ID,
        tenantId: TENANT_ID,
        orderNumber: 'SALE-000001',
        customerId: CUSTOMER_ID,
        status: 'draft',
        totalAmount: 5000,
      };

      const mockLines = [
        { id: 'line-1', orderId: ORDER_ID, lineNumber: 1, description: 'Gadget', quantity: 5, unitPrice: 1000, amount: 5000 },
      ];

      mocks.mockReturning
        .mockResolvedValueOnce([mockOrder])
        .mockResolvedValueOnce(mockLines);

      const result = await orderService.createOrder(TENANT_ID, {
        customerId: CUSTOMER_ID,
        lines: [
          { description: 'Gadget', quantity: 5, unitPrice: 1000 },
        ],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orderNumber).toBe('SALE-000001');
        expect(result.value.totalAmount).toBe(5000);
        expect(result.value.lines).toHaveLength(1);
      }
    });
  });

  describe('confirmOrder', () => {
    it('should confirm a draft order', async () => {
      const mockOrder = {
        id: ORDER_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockOrder]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const confirmedOrder = { ...mockOrder, status: 'confirmed' };
      mocks.mockReturning.mockResolvedValueOnce([confirmedOrder]);

      const result = await orderService.confirmOrder(TENANT_ID, ORDER_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('confirmed');
      }
    });
  });

  describe('generateInvoice', () => {
    it('should generate invoice from confirmed order', async () => {
      const mockOrder = {
        id: ORDER_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        status: 'confirmed',
        totalAmount: 5000,
        notes: null,
      };
      const mockOrderLines = [
        { id: 'line-1', orderId: ORDER_ID, lineNumber: 1, description: 'Gadget', quantity: 5, unitPrice: 1000, amount: 5000, itemId: null },
      ];

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockOrder]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve(mockOrderLines);
        }
        return chain;
      });

      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'INVO-000001' });

      const mockInvoice = {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        invoiceNumber: 'INVO-000001',
        customerId: CUSTOMER_ID,
        orderId: ORDER_ID,
        status: 'draft',
        totalAmount: 5000,
      };

      mocks.mockReturning
        .mockResolvedValueOnce([mockInvoice])  // insert invoice
        .mockResolvedValueOnce([]);             // insert invoice lines

      const result = await orderService.generateInvoice(TENANT_ID, ORDER_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceNumber).toBe('INVO-000001');
        expect(result.value.orderId).toBe(ORDER_ID);
        expect(result.value.totalAmount).toBe(5000);
      }
    });

    it('should reject generating invoice from non-confirmed order', async () => {
      const mockOrder = { id: ORDER_ID, tenantId: TENANT_ID, status: 'draft' };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);

        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockOrder]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const result = await orderService.generateInvoice(TENANT_ID, ORDER_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Invoice Tests
// ════════════════════════════════════════════════════════════════════

describe('Invoice Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createInvoice', () => {
    it('should create an invoice with lines', async () => {
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'INVO-000001' });

      const mockInvoice = {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        invoiceNumber: 'INVO-000001',
        customerId: CUSTOMER_ID,
        status: 'draft',
        totalAmount: 2000,
        taxAmount: 0,
        paidAmount: 0,
      };

      const mockLines = [
        { id: 'line-1', invoiceId: INVOICE_ID, lineNumber: 1, description: 'Service', quantity: 2, unitPrice: 1000, amount: 2000 },
      ];

      mocks.mockReturning
        .mockResolvedValueOnce([mockInvoice])
        .mockResolvedValueOnce(mockLines);

      const result = await invoiceService.createInvoice(TENANT_ID, {
        customerId: CUSTOMER_ID,
        dueDate: '2026-05-10T00:00:00.000Z',
        lines: [
          { description: 'Service', quantity: 2, unitPrice: 1000 },
        ],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceNumber).toBe('INVO-000001');
        expect(result.value.totalAmount).toBe(2000);
        expect(result.value.lines).toHaveLength(1);
      }
    });
  });

  describe('sendInvoice', () => {
    it('should transition draft invoice to sent', async () => {
      const mockInvoice = {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);
        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockInvoice]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const sentInvoice = { ...mockInvoice, status: 'sent' };
      mocks.mockReturning.mockResolvedValueOnce([sentInvoice]);

      const result = await invoiceService.sendInvoice(TENANT_ID, INVOICE_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('sent');
      }
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const mockInvoice = {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'sent',
        totalAmount: 10000,
        paidAmount: 0,
        dueDate: new Date(),
      };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);
        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockInvoice]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const partialPaid = { ...mockInvoice, paidAmount: 5000 };
      mocks.mockReturning.mockResolvedValueOnce([partialPaid]);

      const result = await invoiceService.recordPayment(TENANT_ID, INVOICE_ID, 5000, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.paidAmount).toBe(5000);
        expect(result.value.status).toBe('sent'); // not fully paid
      }
    });

    it('should mark invoice as paid when fully paid', async () => {
      const mockInvoice = {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'sent',
        totalAmount: 10000,
        paidAmount: 5000,
        dueDate: new Date(),
      };

      let selectCallIdx = 0;
      mocks.mockSelect.mockImplementation(() => {
        const idx = selectCallIdx++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);
        if (idx === 0) {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([mockInvoice]);
        } else {
          chain['then'] = (resolve: (val: unknown) => void) => resolve([]);
        }
        return chain;
      });

      const fullPaid = { ...mockInvoice, paidAmount: 10000, status: 'paid', paidDate: new Date() };
      mocks.mockReturning.mockResolvedValueOnce([fullPaid]);

      const result = await invoiceService.recordPayment(TENANT_ID, INVOICE_ID, 5000, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.paidAmount).toBe(10000);
        expect(result.value.status).toBe('paid');
      }
    });
  });

  describe('getAgingReport', () => {
    it('should group unpaid invoices into aging buckets', async () => {
      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

      const unpaidInvoices = [
        { id: 'inv-1', tenantId: TENANT_ID, status: 'sent', totalAmount: 5000, paidAmount: 0, dueDate: daysAgo(-5) }, // current (due in future)
        { id: 'inv-2', tenantId: TENANT_ID, status: 'sent', totalAmount: 3000, paidAmount: 1000, dueDate: daysAgo(15) }, // 1-30 days
        { id: 'inv-3', tenantId: TENANT_ID, status: 'overdue', totalAmount: 8000, paidAmount: 0, dueDate: daysAgo(45) }, // 31-60 days
        { id: 'inv-4', tenantId: TENANT_ID, status: 'overdue', totalAmount: 2000, paidAmount: 0, dueDate: daysAgo(100) }, // 90+ days
      ];

      // select unpaid invoices
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['from'] = vi.fn().mockReturnValue(chain);
      chain['where'] = vi.fn().mockReturnValue(chain);
      chain['then'] = (resolve: (val: unknown) => void) => resolve(unpaidInvoices);
      mocks.mockSelect.mockReturnValueOnce(chain);

      const result = await invoiceService.getAgingReport(TENANT_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(5);

        const current = result.value.find((b) => b.bucket === 'current');
        expect(current?.count).toBe(1);
        expect(current?.totalOutstanding).toBe(5000);

        const bucket1_30 = result.value.find((b) => b.bucket === '1-30');
        expect(bucket1_30?.count).toBe(1);
        expect(bucket1_30?.totalOutstanding).toBe(2000); // 3000 - 1000

        const bucket31_60 = result.value.find((b) => b.bucket === '31-60');
        expect(bucket31_60?.count).toBe(1);
        expect(bucket31_60?.totalOutstanding).toBe(8000);

        const bucket90plus = result.value.find((b) => b.bucket === '90+');
        expect(bucket90plus?.count).toBe(1);
        expect(bucket90plus?.totalOutstanding).toBe(2000);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Billing Plan Tests
// ════════════════════════════════════════════════════════════════════

describe('Billing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createBillingPlan', () => {
    it('should create a billing plan with schedule lines', async () => {
      const mockPlan = {
        id: PLAN_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        name: 'Monthly Plan',
        planType: 'recurring',
        billingMethod: 'advance',
        frequency: 'monthly',
        status: 'active',
        totalAmount: 120000,
      };

      // insert plan -> returning
      mocks.mockReturning
        .mockResolvedValueOnce([mockPlan])
        // insert schedule lines -> returning
        .mockResolvedValueOnce([
          { id: 'sl-1', billingPlanId: PLAN_ID, lineNumber: 1, amount: 10000, status: 'scheduled' },
          { id: 'sl-2', billingPlanId: PLAN_ID, lineNumber: 2, amount: 10000, status: 'scheduled' },
        ]);

      const result = await billingService.createBillingPlan(TENANT_ID, {
        customerId: CUSTOMER_ID,
        name: 'Monthly Plan',
        planType: 'recurring',
        billingMethod: 'advance',
        frequency: 'monthly',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
        totalAmount: 120000,
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Monthly Plan');
        expect(result.value.status).toBe('active');
        expect(result.value.scheduleLines).toHaveLength(2);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          entityType: 'billing_plan',
        }),
      );
    });

    it('should create a one-time billing plan with single schedule line', async () => {
      const mockPlan = {
        id: PLAN_ID,
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        name: 'One-time Fee',
        planType: 'fixed',
        billingMethod: 'advance',
        frequency: 'one_time',
        status: 'active',
        totalAmount: 50000,
      };

      mocks.mockReturning
        .mockResolvedValueOnce([mockPlan])
        .mockResolvedValueOnce([
          { id: 'sl-1', billingPlanId: PLAN_ID, lineNumber: 1, amount: 50000, status: 'scheduled' },
        ]);

      const result = await billingService.createBillingPlan(TENANT_ID, {
        customerId: CUSTOMER_ID,
        name: 'One-time Fee',
        planType: 'fixed',
        billingMethod: 'advance',
        frequency: 'one_time',
        startDate: '2026-06-01T00:00:00.000Z',
        totalAmount: 50000,
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scheduleLines).toHaveLength(1);
      }
    });
  });
});
