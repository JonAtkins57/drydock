import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImapClient, ImapMessage } from '../../src/ap-portal/imap.poller';
import type { OcrClient, OcrResult } from '../../src/ap-portal/ocr.worker';
import type { S3Client } from '../../src/ap-portal/s3.client';

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

import { db, pool } from '../../src/db/connection';

// ── Test Data ──────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const VENDOR_ID = '00000000-0000-0000-0000-000000000100';
const INVOICE_ID = '00000000-0000-0000-0000-000000000200';
const OCR_RESULT_ID = '00000000-0000-0000-0000-000000000800';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

const now = new Date();

function mockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    tenantId: TENANT_ID,
    invoiceNumber: 'INV-001',
    vendorId: VENDOR_ID,
    poId: null,
    status: 'ocr_pending',
    invoiceDate: now,
    dueDate: now,
    totalAmount: 10000,
    subtotal: 9000,
    taxAmount: 1000,
    currency: 'USD',
    source: 'email',
    sourceEmail: 'vendor@example.com',
    attachmentUrl: 'https://bucket.s3.amazonaws.com/test/invoice.pdf',
    attachmentHash: 'abc123',
    ocrConfidence: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

// ── Helpers: Mock IMAP Client ───────────────────────────────────────

function createMockImapClient(messages: ImapMessage[]): ImapClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    fetchUnread: vi.fn().mockResolvedValue(messages),
    markRead: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockS3Client(): S3Client & { uploads: Map<string, Buffer> } {
  const uploads = new Map<string, Buffer>();
  return {
    uploads,
    upload: vi.fn(async (bucket: string, key: string, body: Buffer) => {
      uploads.set(`${bucket}/${key}`, body);
      return `https://${bucket}.s3.amazonaws.com/${key}`;
    }),
    getSignedUrl: vi.fn(async (bucket: string, key: string) => {
      return `https://${bucket}.s3.amazonaws.com/${key}?signed=true`;
    }),
  };
}

function createMockOcrClient(result: Partial<OcrResult> = {}): OcrClient {
  const defaultResult: OcrResult = {
    vendor: 'Acme Corp',
    invoiceNumber: 'INV-OCR-001',
    date: '2026-01-15',
    dueDate: '2026-02-15',
    total: 15000,
    subtotal: 13500,
    tax: 1500,
    poNumber: 'PO-12345',
    lineItems: [
      { description: 'Widget A', quantity: 10, unitPrice: 1000, amount: 10000 },
    ],
    paymentTerms: 'Net 30',
    fieldConfidences: {
      vendor: 0.95,
      invoiceNumber: 0.98,
      date: 0.97,
      dueDate: 0.92,
      total: 0.99,
      subtotal: 0.96,
      tax: 0.94,
      poNumber: 0.91,
      lineItems: 0.93,
    },
    ...result,
  };
  return {
    analyzeDocument: vi.fn().mockResolvedValue(defaultResult),
  };
}

// ── S3 Stub Tests ───────────────────────────────────────────────────

describe('AP Portal — S3 Stub Client', () => {
  it('upload returns a URL and getSignedUrl works for uploaded objects', async () => {
    const { createStubS3Client } = await import('../../src/ap-portal/s3.client');
    const client = createStubS3Client();

    const url = await client.upload('my-bucket', 'invoices/test.pdf', Buffer.from('pdf-data'));
    expect(url).toBe('https://my-bucket.s3.amazonaws.com/invoices/test.pdf');

    const signedUrl = await client.getSignedUrl('my-bucket', 'invoices/test.pdf');
    expect(signedUrl).toContain('my-bucket.s3.amazonaws.com/invoices/test.pdf');
    expect(signedUrl).toContain('X-Amz-Signature');
  });

  it('getSignedUrl throws for non-existent objects', async () => {
    const { createStubS3Client } = await import('../../src/ap-portal/s3.client');
    const client = createStubS3Client();

    await expect(client.getSignedUrl('my-bucket', 'missing.pdf')).rejects.toThrow('Object not found');
  });
});

// ── IMAP Poller Tests ───────────────────────────────────────────────

describe('AP Portal — IMAP Poller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes email with PDF attachment and creates AP invoice', async () => {
    const pdfContent = Buffer.from('fake-pdf-content');
    const messages: ImapMessage[] = [{
      uid: 'msg-1',
      from: 'vendor@example.com',
      subject: 'Invoice #123',
      body: 'Please find attached invoice.',
      date: new Date('2026-01-15'),
      attachments: [{
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        content: pdfContent,
      }],
    }];

    const imapClient = createMockImapClient(messages);
    const s3Client = createMockS3Client();

    // Mock: checkDuplicate — no duplicate found
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]),
    );
    // Mock: createFromUpload insert
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([mockInvoice({ status: 'ocr_pending', source: 'email' })]),
    );

    const { processInboxEmails } = await import('../../src/ap-portal/imap.poller');
    const result = await processInboxEmails(TENANT_ID, imapClient, s3Client);

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(imapClient.markRead).toHaveBeenCalledWith('msg-1');
    expect(s3Client.upload).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate attachments', async () => {
    const pdfContent = Buffer.from('duplicate-pdf');
    const messages: ImapMessage[] = [{
      uid: 'msg-2',
      from: 'vendor@example.com',
      subject: 'Invoice #456',
      body: 'Duplicate.',
      date: new Date('2026-01-16'),
      attachments: [{
        filename: 'invoice-dup.pdf',
        contentType: 'application/pdf',
        content: pdfContent,
      }],
    }];

    const imapClient = createMockImapClient(messages);
    const s3Client = createMockS3Client();

    // Mock: checkDuplicate — duplicate found
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([{ id: INVOICE_ID, totalAmount: 5000 }]),
    );

    const { processInboxEmails } = await import('../../src/ap-portal/imap.poller');
    const result = await processInboxEmails(TENANT_ID, imapClient, s3Client);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(s3Client.upload).not.toHaveBeenCalled();
    expect(imapClient.markRead).toHaveBeenCalledWith('msg-2');
  });

  it('skips emails with no processable attachments', async () => {
    const messages: ImapMessage[] = [{
      uid: 'msg-3',
      from: 'someone@example.com',
      subject: 'Hello',
      body: 'No attachments here.',
      date: new Date(),
      attachments: [{
        filename: 'readme.txt',
        contentType: 'text/plain',
        content: Buffer.from('just text'),
      }],
    }];

    const imapClient = createMockImapClient(messages);
    const s3Client = createMockS3Client();

    const { processInboxEmails } = await import('../../src/ap-portal/imap.poller');
    const result = await processInboxEmails(TENANT_ID, imapClient, s3Client);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(imapClient.markRead).toHaveBeenCalledWith('msg-3');
  });

  it('stub IMAP client returns empty array', async () => {
    const { createStubImapClient } = await import('../../src/ap-portal/imap.poller');
    const client = createStubImapClient();

    await client.connect();
    const messages = await client.fetchUnread();
    expect(messages).toEqual([]);
  });
});

// ── OCR Worker Tests ────────────────────────────────────────────────

describe('AP Portal — OCR Worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes document, stores results, routes to coding when all confidences > 0.9', async () => {
    const ocrClient = createMockOcrClient({
      fieldConfidences: {
        vendor: 0.95,
        invoiceNumber: 0.98,
        date: 0.97,
        dueDate: 0.92,
        total: 0.99,
        subtotal: 0.96,
        tax: 0.94,
        poNumber: 0.91,
        lineItems: 0.93,
      },
    });

    // Mock: select invoice (ocr_pending status)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'ocr_pending' })]),
    );
    // Mock: insert OCR result
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([{ id: OCR_RESULT_ID }]),
    );
    // Mock: update invoice with extracted data
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ status: 'coding' })]),
    );
    // Mock: insert line items
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([]),
    );
    // Mock: matchToPO — select invoice for PO matching
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding', totalAmount: 15000 })]),
    );
    // Mock: matchToPO — insert match result
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([{ id: 'match-auto', matchStatus: 'matched' }]),
    );
    // Mock: matchToPO — update invoice poId
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ poId: 'PO-12345' })]),
    );
    // Mock: applyCodingRules — select invoice
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding' })]),
    );
    // Mock: applyCodingRules — select rules
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]),
    );
    // Mock: applyCodingRules — select lines
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]),
    );

    const { processOcrJob } = await import('../../src/ap-portal/ocr.worker');
    const result = await processOcrJob(TENANT_ID, INVOICE_ID, ocrClient);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('coding');
      expect(result.value.ocrResultId).toBe(OCR_RESULT_ID);
    }
  });

  it('routes to review when any confidence < 0.9', async () => {
    const ocrClient = createMockOcrClient({
      fieldConfidences: {
        vendor: 0.95,
        invoiceNumber: 0.85, // below threshold
        date: 0.97,
        total: 0.99,
      },
      poNumber: null, // no PO number
    });

    // Mock: select invoice
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'ocr_pending' })]),
    );
    // Mock: insert OCR result
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([{ id: OCR_RESULT_ID }]),
    );
    // Mock: update invoice
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ status: 'review' })]),
    );
    // Mock: insert line items
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([]),
    );

    const { processOcrJob } = await import('../../src/ap-portal/ocr.worker');
    const result = await processOcrJob(TENANT_ID, INVOICE_ID, ocrClient);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('review');
    }
  });

  it('auto-matches PO when extracted with high confidence', async () => {
    const ocrClient = createMockOcrClient({
      poNumber: 'PO-99999',
      fieldConfidences: {
        vendor: 0.95,
        invoiceNumber: 0.98,
        date: 0.97,
        dueDate: 0.92,
        total: 0.99,
        subtotal: 0.96,
        tax: 0.94,
        poNumber: 0.95, // above PO threshold of 0.85
        lineItems: 0.93,
      },
    });

    // Mock pool.connect for lookupPOAmount in matchToPO (called without poData)
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ total_amount: '15000', total_quantity: '10' }] }),
      release: vi.fn(),
    };
    (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

    // Mock: select invoice (processOcrJob)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'ocr_pending' })]),
    );
    // Mock: insert OCR result
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([{ id: OCR_RESULT_ID }]),
    );
    // Mock: update invoice with extracted data
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ status: 'coding' })]),
    );
    // Mock: insert line items
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([]),
    );
    // Mock: matchToPO — select invoice
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding', totalAmount: 15000 })]),
    );
    // Mock: matchToPO — insert match result
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildInsertChain([{ id: 'match-po', matchStatus: 'matched', matchType: 'two_way', poId: 'PO-99999', tenantId: TENANT_ID, apInvoiceId: INVOICE_ID, priceVariance: 0, quantityVariance: 0, tolerancePercent: '5', notes: 'ok', createdAt: now }]),
    );
    // Mock: matchToPO — update invoice poId
    (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildUpdateChain([mockInvoice({ poId: 'PO-99999' })]),
    );
    // Mock: applyCodingRules — select invoice
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding' })]),
    );
    // Mock: applyCodingRules — select rules (empty)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]),
    );
    // Mock: applyCodingRules — select lines (empty)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([]),
    );

    const { processOcrJob } = await import('../../src/ap-portal/ocr.worker');
    const result = await processOcrJob(TENANT_ID, INVOICE_ID, ocrClient);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('coding');
      expect(result.value.ocrResultId).toBe(OCR_RESULT_ID);
    }
    // Verify matchToPO was invoked (PO lookup + match insert)
    expect(pool.connect).toHaveBeenCalled();
  });

  it('rejects non-ocr_pending invoices', async () => {
    const ocrClient = createMockOcrClient();

    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'coding' })]),
    );

    const { processOcrJob } = await import('../../src/ap-portal/ocr.worker');
    const result = await processOcrJob(TENANT_ID, INVOICE_ID, ocrClient);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toContain('ocr_pending');
    }
  });

  it('rejects invoice without attachment URL', async () => {
    const ocrClient = createMockOcrClient();

    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      buildSelectChain([mockInvoice({ status: 'ocr_pending', attachmentUrl: null })]),
    );

    const { processOcrJob } = await import('../../src/ap-portal/ocr.worker');
    const result = await processOcrJob(TENANT_ID, INVOICE_ID, ocrClient);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toContain('attachment');
    }
  });
});

// ── Queue Function Tests (no Redis needed) ──────────────────────────

describe('AP Portal — Queue Functions', () => {
  it('queueOcrJob logs warning when queue not initialized', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { queueOcrJob } = await import('../../src/ap-portal/workers');
    await queueOcrJob(INVOICE_ID, TENANT_ID);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OCR queue not initialized'));
    warnSpy.mockRestore();
  });

  it('queueInboxPoll logs warning when queue not initialized', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { queueInboxPoll } = await import('../../src/ap-portal/workers');
    await queueInboxPoll(TENANT_ID, 'config-1');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Inbox poll queue not initialized'));
    warnSpy.mockRestore();
  });
});
