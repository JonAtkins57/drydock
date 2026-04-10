import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockPdfFn = vi.fn();
  const mockSetContent = vi.fn();
  const mockClose = vi.fn();
  const mockNewPage = vi.fn();
  const mockLaunch = vi.fn();

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

  const selectChain = makeChain();

  function resetChains() {
    (selectChain['where'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    (selectChain['from'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    (selectChain['offset'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    (selectChain['orderBy'] as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);
    mockLimit.mockReturnValue(selectChain);
  }

  return {
    mockPdfFn,
    mockSetContent,
    mockClose,
    mockNewPage,
    mockLaunch,
    mockReturning,
    mockLimit,
    selectChain,
    resetChains,
    mockSelect: vi.fn().mockReturnValue(selectChain),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('puppeteer', () => ({
  default: {
    launch: mocks.mockLaunch,
  },
}));

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: vi.fn(),
    select: mocks.mockSelect,
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { generateQuotePdf, generateInvoicePdf } from '../../src/q2c/pdf.js';

// ── Constants ──────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const QUOTE_ID = '33333333-4444-5555-6666-777777777777';
const INVOICE_ID = '55555555-6666-7777-8888-999999999999';
const CUSTOMER_ID = '22222222-3333-4444-5555-666666666666';

const MOCK_QUOTE = {
  id: QUOTE_ID,
  tenantId: TENANT_ID,
  quoteNumber: 'QUOT-000001',
  customerId: CUSTOMER_ID,
  name: 'Test Quote',
  status: 'draft',
  totalAmount: 10000,
  validUntil: new Date('2026-12-31'),
  notes: 'Test notes',
  version: 1,
  parentQuoteId: null,
  docusignEnvelopeId: null,
  docusignStatus: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_QUOTE_LINE = {
  id: 'line-1',
  tenantId: TENANT_ID,
  quoteId: QUOTE_ID,
  lineNumber: 1,
  itemId: null,
  description: 'Widget',
  quantity: 2,
  unitPrice: 5000,
  amount: 10000,
  accountId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_INVOICE = {
  id: INVOICE_ID,
  tenantId: TENANT_ID,
  invoiceNumber: 'INV-000001',
  customerId: CUSTOMER_ID,
  orderId: null,
  status: 'draft',
  totalAmount: 11000,
  taxAmount: 1000,
  dueDate: new Date('2026-05-01'),
  invoiceDate: new Date('2026-04-01'),
  paidDate: null,
  paidAmount: 0,
  notes: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_INVOICE_LINE = {
  id: 'inv-line-1',
  tenantId: TENANT_ID,
  invoiceId: INVOICE_ID,
  lineNumber: 1,
  itemId: null,
  description: 'Service fee',
  quantity: 1,
  unitPrice: 10000,
  amount: 10000,
  accountId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CUSTOMER = { name: 'Acme Corp' };
const MOCK_PDF_BYTES = Buffer.from('%PDF-mock');

// ── Puppeteer browser/page mock factory ──────────────────────────

function setupPuppeteerSuccess() {
  mocks.mockSetContent.mockResolvedValue(undefined);
  mocks.mockClose.mockResolvedValue(undefined);
  mocks.mockPdfFn.mockResolvedValue(MOCK_PDF_BYTES);
  mocks.mockNewPage.mockResolvedValue({
    setContent: mocks.mockSetContent,
    pdf: mocks.mockPdfFn,
  });
  mocks.mockLaunch.mockResolvedValue({
    newPage: mocks.mockNewPage,
    close: mocks.mockClose,
  });
}

// ── Select call sequencing helper ────────────────────────────────

function setupSelectSequence(responses: unknown[][]) {
  let callCount = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callCount++;
    const resp = responses[idx] ?? [];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockResolvedValue(resp);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

// ════════════════════════════════════════════════════════════════════
// generateQuotePdf Tests
// ════════════════════════════════════════════════════════════════════

describe('generateQuotePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
  });

  it('returns Buffer when quote exists', async () => {
    setupPuppeteerSuccess();
    // select calls: getQuote (quotes), getQuote (quoteLines), customers
    setupSelectSequence([
      [MOCK_QUOTE],
      [MOCK_QUOTE_LINE],
      [MOCK_CUSTOMER],
    ]);

    const result = await generateQuotePdf(TENANT_ID, QUOTE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.isBuffer(result.value)).toBe(true);
    }
    expect(mocks.mockLaunch).toHaveBeenCalledOnce();
    expect(mocks.mockPdfFn).toHaveBeenCalledOnce();
  });

  it('returns NOT_FOUND when quote does not exist', async () => {
    setupSelectSequence([[], []]);

    const result = await generateQuotePdf(TENANT_ID, QUOTE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(mocks.mockLaunch).not.toHaveBeenCalled();
  });

  it('returns INTERNAL when puppeteer.launch throws', async () => {
    mocks.mockLaunch.mockRejectedValue(new Error('Chrome not found'));
    setupSelectSequence([
      [MOCK_QUOTE],
      [MOCK_QUOTE_LINE],
      [MOCK_CUSTOMER],
    ]);

    const result = await generateQuotePdf(TENANT_ID, QUOTE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).toBe('PDF generation failed');
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// generateInvoicePdf Tests
// ════════════════════════════════════════════════════════════════════

describe('generateInvoicePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
  });

  it('returns Buffer when invoice exists', async () => {
    setupPuppeteerSuccess();
    // select calls: getInvoice (invoices), getInvoice (invoiceLines), customers
    setupSelectSequence([
      [MOCK_INVOICE],
      [MOCK_INVOICE_LINE],
      [MOCK_CUSTOMER],
    ]);

    const result = await generateInvoicePdf(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.isBuffer(result.value)).toBe(true);
    }
    expect(mocks.mockLaunch).toHaveBeenCalledOnce();
    expect(mocks.mockPdfFn).toHaveBeenCalledOnce();
  });

  it('returns NOT_FOUND when invoice does not exist', async () => {
    setupSelectSequence([[], []]);

    const result = await generateInvoicePdf(TENANT_ID, INVOICE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(mocks.mockLaunch).not.toHaveBeenCalled();
  });
});
