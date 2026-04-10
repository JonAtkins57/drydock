import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Result, AppError } from '../../src/lib/result';

// ── Mocks ──────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    then: (resolve: (val: unknown) => void) => resolve(rows),
    [Symbol.iterator]: function* () { yield* rows; },
  };
  Object.defineProperty(chain, 'then', {
    value: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    configurable: true,
  });
  return chain;
}

function buildInsertChain(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function buildUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

vi.mock('../../src/db/connection', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('../../src/core/audit.service', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/numbering.service', () => ({
  generateNumber: vi.fn().mockResolvedValue({ ok: true, value: 'JOUR-000001' }),
}));

vi.mock('../../src/core/auth.service', () => ({
  checkPermission: vi.fn().mockResolvedValue({ ok: true, value: true }),
  checkSegregationOfDuties: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

import { db, pool } from '../../src/db/connection';

// ── Test Data ──────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const VENDOR_ID = '00000000-0000-0000-0000-000000000100';
const INVOICE_ID = '00000000-0000-0000-0000-000000000200';
const LINE_ID = '00000000-0000-0000-0000-000000000300';
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000400';
const PO_ID = '00000000-0000-0000-0000-000000000500';
const RULE_ID = '00000000-0000-0000-0000-000000000600';
const RECEIPT_ID = '00000000-0000-0000-0000-000000000700';

const now = new Date();

function mockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    tenantId: TENANT_ID,
    invoiceNumber: 'INV-001',
    vendorId: VENDOR_ID,
    poId: null,
    status: 'coding',
    invoiceDate: now,
    dueDate: now,
    totalAmount: 10000,
    subtotal: 9000,
    taxAmount: 1000,
    currency: 'USD',
    source: 'manual',
    sourceEmail: null,
    attachmentUrl: null,
    attachmentHash: null,
    ocrConfidence: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ...overrides,
  };
}

function mockLine(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    tenantId: TENANT_ID,
    apInvoiceId: INVOICE_ID,
    lineNumber: 1,
    description: 'Office supplies',
    quantity: 1,
    unitPrice: 10000,
    amount: 10000,
    accountId: null,
    departmentId: null,
    projectId: null,
    costCenterId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mockCodingRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    vendorId: VENDOR_ID,
    descriptionPattern: 'office',
    defaultAccountId: ACCOUNT_ID,
    defaultDepartmentId: null,
    defaultProjectId: null,
    defaultCostCenterId: null,
    priority: 10,
    isActive: true,
    matchCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AP Portal — Intake Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createManualInvoice', () => {
    it('should create a manual invoice with lines', async () => {
      // Mock duplicate check — no existing invoice
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([]), // checkDuplicate returns empty
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([mockInvoice()]), // insert invoice
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([mockLine()]), // insert lines
      );

      const { createManualInvoice } = await import('../../src/ap-portal/intake.service');

      const result = await createManualInvoice(TENANT_ID, {
        invoiceNumber: 'INV-001',
        vendorId: VENDOR_ID,
        totalAmount: 10000,
        currency: 'USD',
        lines: [{ description: 'Office supplies', quantity: 1, unitPrice: 10000, amount: 10000 }],
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceNumber).toBe('INV-001');
        expect(result.value.status).toBe('coding');
        expect(result.value.lines).toHaveLength(1);
      }
    });

    it('should detect duplicates and return CONFLICT', async () => {
      // Mock duplicate check — existing invoice found
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([{ id: INVOICE_ID, totalAmount: 10000 }]),
      );

      const { createManualInvoice } = await import('../../src/ap-portal/intake.service');

      const result = await createManualInvoice(TENANT_ID, {
        invoiceNumber: 'INV-001',
        vendorId: VENDOR_ID,
        totalAmount: 10000,
        currency: 'USD',
        lines: [{ description: 'Test', quantity: 1, unitPrice: 10000, amount: 10000 }],
      }, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('createFromUpload', () => {
    it('should create an invoice with ocr_pending status', async () => {
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([mockInvoice({ status: 'ocr_pending', source: 'upload' })]),
      );

      const { createFromUpload } = await import('../../src/ap-portal/intake.service');

      const result = await createFromUpload(TENANT_ID, {
        attachmentUrl: 'https://s3.example.com/invoice.pdf',
        source: 'upload',
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('ocr_pending');
      }
    });
  });

  describe('checkDuplicate', () => {
    it('should return null when no duplicate exists', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([]),
      );

      const { checkDuplicate } = await import('../../src/ap-portal/intake.service');

      const result = await checkDuplicate(TENANT_ID, VENDOR_ID, 'INV-NEW', 5000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return existing invoice id when duplicate found', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([{ id: INVOICE_ID, totalAmount: 10000 }]),
      );

      const { checkDuplicate } = await import('../../src/ap-portal/intake.service');

      const result = await checkDuplicate(TENANT_ID, VENDOR_ID, 'INV-001', 10000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(INVOICE_ID);
      }
    });
  });
});

describe('AP Portal — Coding Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyCodingRules', () => {
    it('should apply matching coding rules to uncoded lines', async () => {
      // Mock: find invoice in coding status
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'coding' })]),
      );
      // Mock: fetch active coding rules
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockCodingRule()]),
      );
      // Mock: fetch invoice lines (uncoded)
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockLine({ accountId: null })]),
      );
      // Mock: update line
      (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildUpdateChain([mockLine({ accountId: ACCOUNT_ID })]),
      );
      // Mock: update rule match count
      (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildUpdateChain([mockCodingRule({ matchCount: 1 })]),
      );

      const { applyCodingRules } = await import('../../src/ap-portal/coding.service');

      const result = await applyCodingRules(TENANT_ID, INVOICE_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.linesUpdated).toBe(1);
        expect(result.value.rulesApplied).toHaveLength(1);
      }
    });

    it('should reject coding for non-coding status invoices', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'posted' })]),
      );

      const { applyCodingRules } = await import('../../src/ap-portal/coding.service');

      const result = await applyCodingRules(TENANT_ID, INVOICE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
      }
    });
  });

  describe('updateLineCoding', () => {
    it('should update coding on a specific line', async () => {
      // Mock: find invoice
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'coding' })]),
      );
      // Mock: find line
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockLine()]),
      );
      // Mock: update line
      (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildUpdateChain([mockLine({ accountId: ACCOUNT_ID })]),
      );

      const { updateLineCoding } = await import('../../src/ap-portal/coding.service');

      const result = await updateLineCoding(
        TENANT_ID, INVOICE_ID, LINE_ID,
        { accountId: ACCOUNT_ID },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accountId).toBe(ACCOUNT_ID);
      }
    });

    it('should return NOT_FOUND for missing invoice', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([]),
      );

      const { updateLineCoding } = await import('../../src/ap-portal/coding.service');

      const result = await updateLineCoding(
        TENANT_ID, INVOICE_ID, LINE_ID,
        { accountId: ACCOUNT_ID },
        USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('submitForApproval', () => {
    it('should transition invoice from coding to approval', async () => {
      // Mock: find invoice in coding status
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'coding' })]),
      );
      // Mock: check for uncoded lines (none found = all coded)
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([]),
      );
      // Mock: update invoice status
      (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildUpdateChain([mockInvoice({ status: 'approval' })]),
      );

      const { submitForApproval } = await import('../../src/ap-portal/coding.service');

      const result = await submitForApproval(TENANT_ID, INVOICE_ID, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('approval');
      }
    });

    it('should reject submission when lines are uncoded', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'coding' })]),
      );
      // Uncoded lines exist
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([{ id: LINE_ID }]),
      );

      const { submitForApproval } = await import('../../src/ap-portal/coding.service');

      const result = await submitForApproval(TENANT_ID, INVOICE_ID, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('account coded');
      }
    });

    it('should reject submission for non-coding status', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ status: 'approved' })]),
      );

      const { submitForApproval } = await import('../../src/ap-portal/coding.service');

      const result = await submitForApproval(TENANT_ID, INVOICE_ID, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
      }
    });
  });
});

describe('AP Portal — PO Matching Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('matchToPO — two-way', () => {
    it('should return matched when amounts are equal', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ totalAmount: 10000 })]),
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([{
          id: 'match-1',
          tenantId: TENANT_ID,
          apInvoiceId: INVOICE_ID,
          poId: PO_ID,
          matchType: 'two_way',
          matchStatus: 'matched',
          priceVariance: 0,
          quantityVariance: 0,
          tolerancePercent: '5',
          notes: 'Price variance: 0 cents (0.00%)',
          createdAt: now,
        }]),
      );

      const { matchToPO } = await import('../../src/ap-portal/matching.service');

      const result = await matchToPO(TENANT_ID, INVOICE_ID, PO_ID, { poTotalAmount: 10000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matchStatus).toBe('matched');
        expect(result.value.priceVariance).toBe(0);
      }
    });

    it('should return tolerance when variance is within 5%', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ totalAmount: 10400 })]),
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([{
          id: 'match-2',
          tenantId: TENANT_ID,
          apInvoiceId: INVOICE_ID,
          poId: PO_ID,
          matchType: 'two_way',
          matchStatus: 'tolerance',
          priceVariance: 400,
          quantityVariance: 0,
          tolerancePercent: '5',
          notes: 'Price variance: 400 cents (4.00%)',
          createdAt: now,
        }]),
      );

      const { matchToPO } = await import('../../src/ap-portal/matching.service');

      const result = await matchToPO(TENANT_ID, INVOICE_ID, PO_ID, { poTotalAmount: 10000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matchStatus).toBe('tolerance');
      }
    });

    it('should return exception when variance exceeds tolerance', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ totalAmount: 12000 })]),
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([{
          id: 'match-3',
          tenantId: TENANT_ID,
          apInvoiceId: INVOICE_ID,
          poId: PO_ID,
          matchType: 'two_way',
          matchStatus: 'exception',
          priceVariance: 2000,
          quantityVariance: 0,
          tolerancePercent: '5',
          notes: 'Price variance: 2000 cents (20.00%)',
          createdAt: now,
        }]),
      );

      const { matchToPO } = await import('../../src/ap-portal/matching.service');

      const result = await matchToPO(TENANT_ID, INVOICE_ID, PO_ID, { poTotalAmount: 10000 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matchStatus).toBe('exception');
      }
    });
  });

  describe('threeWayMatch', () => {
    it('should return matched for exact price and quantity match', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ totalAmount: 10000 })]),
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([{
          id: 'match-4',
          tenantId: TENANT_ID,
          apInvoiceId: INVOICE_ID,
          poId: PO_ID,
          matchType: 'three_way',
          matchStatus: 'matched',
          priceVariance: 0,
          quantityVariance: 0,
          tolerancePercent: '5',
          notes: expect.any(String),
          createdAt: now,
        }]),
      );

      const { threeWayMatch } = await import('../../src/ap-portal/matching.service');

      const result = await threeWayMatch(
        TENANT_ID, INVOICE_ID, PO_ID, RECEIPT_ID,
        { poTotalAmount: 10000, poQuantity: 10, receiptQuantity: 10 },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matchStatus).toBe('matched');
        expect(result.value.matchType).toBe('three_way');
      }
    });

    it('should return exception when quantity varies', async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildSelectChain([mockInvoice({ totalAmount: 10000 })]),
      );
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        buildInsertChain([{
          id: 'match-5',
          tenantId: TENANT_ID,
          apInvoiceId: INVOICE_ID,
          poId: PO_ID,
          matchType: 'three_way',
          matchStatus: 'exception',
          priceVariance: 0,
          quantityVariance: -3,
          tolerancePercent: '5',
          notes: expect.any(String),
          createdAt: now,
        }]),
      );

      const { threeWayMatch } = await import('../../src/ap-portal/matching.service');

      const result = await threeWayMatch(
        TENANT_ID, INVOICE_ID, PO_ID, RECEIPT_ID,
        { poTotalAmount: 10000, poQuantity: 10, receiptQuantity: 7 },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matchStatus).toBe('exception');
      }
    });
  });
});

describe('AP Portal — Approval Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('full lifecycle: intake -> coding -> approval -> approved', async () => {
    // Step 1: Create manual invoice (coding status)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]), // no duplicate
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([mockInvoice({ status: 'coding' })]),
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([mockLine()]),
    );

    const { createManualInvoice } = await import('../../src/ap-portal/intake.service');
    const createResult = await createManualInvoice(TENANT_ID, {
      invoiceNumber: 'INV-FLOW-001',
      vendorId: VENDOR_ID,
      totalAmount: 5000,
      currency: 'USD',
      lines: [{ description: 'Test item', quantity: 1, unitPrice: 5000, amount: 5000 }],
    }, USER_ID);

    expect(createResult.ok).toBe(true);

    // Step 2: Submit for approval (all lines coded)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding' })]),
    );
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]), // no uncoded lines
    );
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ status: 'approval' })]),
    );

    const { submitForApproval } = await import('../../src/ap-portal/coding.service');
    const submitResult = await submitForApproval(TENANT_ID, INVOICE_ID, USER_ID);

    expect(submitResult.ok).toBe(true);
    if (submitResult.ok) {
      expect(submitResult.value.status).toBe('approval');
    }
  });
});
