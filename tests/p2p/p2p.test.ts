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
    logAction: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { requisitionService } from '../../src/p2p/requisitions.service.js';
import { purchaseOrderService } from '../../src/p2p/purchase-orders.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const REQ_ID = '22222222-3333-4444-5555-666666666666';
const PO_ID = '33333333-4444-5555-6666-777777777777';
const PO_LINE_ID = '44444444-5555-6666-7777-888888888888';
const VENDOR_ID = '55555555-6666-7777-8888-999999999999';
const GR_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

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

// Helper for sequential select calls (get header + get lines)
function setupGetWithLinesMock(
  headerRow: Record<string, unknown> | null,
  lineRows: Record<string, unknown>[],
) {
  let selectCallIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = selectCallIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);

    if (idx === 0) {
      // First select: header row with limit
      chain['then'] = (resolve: (val: unknown) => void) =>
        resolve(headerRow ? [headerRow] : []);
      return chain;
    } else {
      // Second select: line rows (no limit)
      chain['then'] = (resolve: (val: unknown) => void) => resolve(lineRows);
      return chain;
    }
  });
}

// ════════════════════════════════════════════════════════════════════
// Requisition Tests
// ════════════════════════════════════════════════════════════════════

describe('Requisition Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
    mocks.generateNumber.mockResolvedValue({ ok: true, value: 'REQU-000001' });
  });

  describe('createRequisition', () => {
    it('should create a requisition with lines and auto-number', async () => {
      const mockReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        requisitionNumber: 'REQU-000001',
        requestedBy: USER_ID,
        status: 'draft',
        totalAmount: 5000,
      };

      const mockLines = [
        {
          id: 'line-1',
          tenantId: TENANT_ID,
          requisitionId: REQ_ID,
          lineNumber: 1,
          description: 'Widget A',
          quantity: 10,
          estimatedUnitPrice: 500,
          estimatedAmount: 5000,
        },
      ];

      // insert requisition -> returning
      mocks.mockReturning.mockResolvedValueOnce([mockReq]);
      // insert lines -> returning
      mocks.mockReturning.mockResolvedValueOnce(mockLines);

      const result = await requisitionService.createRequisition(TENANT_ID, {
        lines: [{ description: 'Widget A', quantity: 10, estimatedUnitPrice: 500 }],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requisitionNumber).toBe('REQU-000001');
        expect(result.value.status).toBe('draft');
        expect(result.value.lines).toHaveLength(1);
      }
      expect(mocks.generateNumber).toHaveBeenCalledWith(TENANT_ID, 'requisition');
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          entityType: 'requisition',
        }),
      );
    });
  });

  describe('submitForApproval', () => {
    it('should transition draft requisition to pending_approval', async () => {
      const existingReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        status: 'draft',
        requisitionNumber: 'REQU-000001',
      };

      const submittedReq = { ...existingReq, status: 'pending_approval' };

      // getRequisition: header select + lines select
      setupGetWithLinesMock(existingReq, []);
      // update -> returning
      mocks.mockReturning.mockResolvedValueOnce([submittedReq]);

      const result = await requisitionService.submitForApproval(TENANT_ID, REQ_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('pending_approval');
      }
    });

    it('should reject submission of non-draft requisition', async () => {
      const existingReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        status: 'approved',
      };

      setupGetWithLinesMock(existingReq, []);

      const result = await requisitionService.submitForApproval(TENANT_ID, REQ_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('approveRequisition', () => {
    it('should approve a pending_approval requisition', async () => {
      const existingReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        status: 'pending_approval',
      };

      const approvedReq = { ...existingReq, status: 'approved' };

      setupGetWithLinesMock(existingReq, []);
      mocks.mockReturning.mockResolvedValueOnce([approvedReq]);

      const result = await requisitionService.approveRequisition(TENANT_ID, REQ_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('approved');
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approve',
          entityType: 'requisition',
        }),
      );
    });
  });

  describe('convertToPO', () => {
    it('should create PO from approved requisition', async () => {
      const existingReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        status: 'approved',
      };

      const reqLines = [
        {
          id: 'line-1',
          requisitionId: REQ_ID,
          lineNumber: 1,
          itemId: null,
          description: 'Widget A',
          quantity: 10,
          estimatedUnitPrice: 500,
          estimatedAmount: 5000,
          accountId: null,
        },
      ];

      const mockPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        poNumber: 'PURC-000001',
        vendorId: VENDOR_ID,
        requisitionId: REQ_ID,
        status: 'draft',
        totalAmount: 5000,
      };

      // getRequisition: header + lines
      setupGetWithLinesMock(existingReq, reqLines);
      // generateNumber for PO
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'PURC-000001' });
      // insert PO -> returning
      mocks.mockReturning.mockResolvedValueOnce([mockPO]);

      const result = await requisitionService.convertToPO(
        TENANT_ID,
        REQ_ID,
        { vendorId: VENDOR_ID },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.poNumber).toBe('PURC-000001');
        expect(result.value.requisitionId).toBe(REQ_ID);
        expect(result.value.vendorId).toBe(VENDOR_ID);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'convert_to_po',
          entityType: 'requisition',
          entityId: REQ_ID,
        }),
      );
    });

    it('should reject conversion of non-approved requisition', async () => {
      const existingReq = {
        id: REQ_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      setupGetWithLinesMock(existingReq, []);

      const result = await requisitionService.convertToPO(
        TENANT_ID,
        REQ_ID,
        { vendorId: VENDOR_ID },
        USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('listRequisitions', () => {
    it('should return paginated requisitions filtered by status', async () => {
      const mockReqs = [
        { id: REQ_ID, requisitionNumber: 'REQU-000001', status: 'draft' },
      ];
      setupListMock(1, mockReqs);

      const result = await requisitionService.listRequisitions(TENANT_ID, {
        page: 1,
        pageSize: 50,
        status: 'draft',
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
// Purchase Order Tests
// ════════════════════════════════════════════════════════════════════

describe('Purchase Order Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
    mocks.generateNumber.mockResolvedValue({ ok: true, value: 'PURC-000001' });
  });

  describe('createPO', () => {
    it('should create a PO with lines', async () => {
      const mockPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        poNumber: 'PURC-000001',
        vendorId: VENDOR_ID,
        status: 'draft',
        totalAmount: 10000,
      };

      const mockLines = [
        {
          id: PO_LINE_ID,
          tenantId: TENANT_ID,
          poId: PO_ID,
          lineNumber: 1,
          description: 'Widget A',
          quantity: 20,
          unitPrice: 500,
          amount: 10000,
          receivedQuantity: 0,
        },
      ];

      mocks.mockReturning.mockResolvedValueOnce([mockPO]);
      mocks.mockReturning.mockResolvedValueOnce(mockLines);

      const result = await purchaseOrderService.createPO(TENANT_ID, {
        vendorId: VENDOR_ID,
        orderDate: new Date().toISOString(),
        lines: [{ description: 'Widget A', quantity: 20, unitPrice: 500 }],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.poNumber).toBe('PURC-000001');
        expect(result.value.lines).toHaveLength(1);
      }
    });
  });

  describe('approvePO', () => {
    it('should approve a draft PO', async () => {
      const existingPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      const approvedPO = { ...existingPO, status: 'approved' };

      setupGetWithLinesMock(existingPO, []);
      mocks.mockReturning.mockResolvedValueOnce([approvedPO]);

      const result = await purchaseOrderService.approvePO(TENANT_ID, PO_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('approved');
      }
    });
  });

  describe('dispatchPO', () => {
    it('should dispatch an approved PO', async () => {
      const existingPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        status: 'approved',
      };

      const dispatchedPO = { ...existingPO, status: 'dispatched' };

      setupGetWithLinesMock(existingPO, []);
      mocks.mockReturning.mockResolvedValueOnce([dispatchedPO]);

      const result = await purchaseOrderService.dispatchPO(TENANT_ID, PO_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('dispatched');
      }
    });

    it('should reject dispatching a non-approved PO', async () => {
      const existingPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      setupGetWithLinesMock(existingPO, []);

      const result = await purchaseOrderService.dispatchPO(TENANT_ID, PO_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('receivePO', () => {
    it('should create goods receipt and update PO line quantities', async () => {
      const existingPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        status: 'dispatched',
      };

      const existingLines = [
        {
          id: PO_LINE_ID,
          tenantId: TENANT_ID,
          poId: PO_ID,
          lineNumber: 1,
          quantity: 20,
          receivedQuantity: 0,
        },
      ];

      const mockGR = {
        id: GR_ID,
        tenantId: TENANT_ID,
        receiptNumber: 'GOOD-000001',
        poId: PO_ID,
        receivedBy: USER_ID,
      };

      const mockReceiptLines = [
        {
          id: 'rl-1',
          tenantId: TENANT_ID,
          receiptId: GR_ID,
          poLineId: PO_LINE_ID,
          quantityReceived: 20,
        },
      ];

      // getPO: header + lines
      setupGetWithLinesMock(existingPO, existingLines);

      // generateNumber for receipt
      mocks.generateNumber.mockResolvedValueOnce({ ok: true, value: 'GOOD-000001' });

      // insert goods receipt -> returning
      mocks.mockReturning.mockResolvedValueOnce([mockGR]);
      // insert receipt lines -> returning
      mocks.mockReturning.mockResolvedValueOnce(mockReceiptLines);

      // After update of PO line quantities, need a select for checking all received
      // The update calls don't use mockReturning directly (they use set/where pattern)
      // Then there's a select to check if all lines fully received
      let additionalSelectIdx = 0;
      const origSelect = mocks.mockSelect.getMockImplementation();
      // After initial getPO calls, we need to handle the "check all received" select
      const afterGetPO = () => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain['from'] = vi.fn().mockReturnValue(chain);
        chain['where'] = vi.fn().mockReturnValue(chain);
        chain['orderBy'] = vi.fn().mockReturnValue(chain);
        chain['limit'] = vi.fn().mockReturnValue(chain);
        chain['offset'] = vi.fn().mockReturnValue(chain);
        // Return updated PO lines with full received quantities
        chain['then'] = (resolve: (val: unknown) => void) =>
          resolve([{ ...existingLines[0], receivedQuantity: 20 }]);
        return chain;
      };

      // Override mockSelect to handle the third call (check all received)
      const originalImpl = mocks.mockSelect.getMockImplementation();
      let totalSelectCalls = 0;
      mocks.mockSelect.mockImplementation((...args: unknown[]) => {
        totalSelectCalls++;
        if (totalSelectCalls <= 2 && originalImpl) {
          return originalImpl(...args);
        }
        return afterGetPO();
      });

      const result = await purchaseOrderService.receivePO(
        TENANT_ID,
        PO_ID,
        {
          lines: [{ poLineId: PO_LINE_ID, quantityReceived: 20 }],
        },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.receiptNumber).toBe('GOOD-000001');
        expect(result.value.lines).toHaveLength(1);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'receive',
          entityType: 'purchase_order',
          entityId: PO_ID,
        }),
      );
    });

    it('should reject receiving against a draft PO', async () => {
      const existingPO = {
        id: PO_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      };

      setupGetWithLinesMock(existingPO, []);

      const result = await purchaseOrderService.receivePO(
        TENANT_ID,
        PO_ID,
        {
          lines: [{ poLineId: PO_LINE_ID, quantityReceived: 10 }],
        },
        USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('getGoodsReceipt', () => {
    it('should return NOT_FOUND for missing receipt', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await purchaseOrderService.getGoodsReceipt(TENANT_ID, GR_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
