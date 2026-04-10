import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { apInvoices, apInvoiceLines, ocrResults } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { applyCodingRules } from './coding.service.js';
import { matchToPO } from './matching.service.js';

// ── OCR Types ───────────────────────────────────────────────────────

export interface OcrLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface OcrResult {
  vendor: string | null;
  invoiceNumber: string | null;
  date: string | null;
  dueDate: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  poNumber: string | null;
  lineItems: OcrLineItem[];
  paymentTerms: string | null;
  fieldConfidences: Record<string, number>;
}

export interface OcrClient {
  analyzeDocument(documentUrl: string): Promise<OcrResult>;
}

// ── Stub Textract Client ────────────────────────────────────────────

export function createTextractClient(
  _region?: string,
  _credentials?: { accessKeyId: string; secretAccessKey: string },
): OcrClient {
  return {
    async analyzeDocument(_documentUrl: string): Promise<OcrResult> {
      return {
        vendor: 'Acme Corp',
        invoiceNumber: 'INV-MOCK-001',
        date: '2026-01-15',
        dueDate: '2026-02-15',
        total: 15000,
        subtotal: 13500,
        tax: 1500,
        poNumber: 'PO-12345',
        lineItems: [
          { description: 'Widget A', quantity: 10, unitPrice: 1000, amount: 10000 },
          { description: 'Widget B', quantity: 5, unitPrice: 700, amount: 3500 },
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
          lineItems: 0.88,
        },
      };
    },
  };
}

// ── OCR Job Processor ───────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.9;
const PO_CONFIDENCE_THRESHOLD = 0.85;

export async function processOcrJob(
  tenantId: string,
  invoiceId: string,
  ocrClient: OcrClient,
): Promise<Result<{ status: string; ocrResultId: string }, AppError>> {
  // 1. Get invoice and verify status
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  if (invoice.status !== 'ocr_pending') {
    return err({
      code: 'VALIDATION',
      message: `Cannot process OCR for invoice in '${invoice.status}' status. Must be 'ocr_pending'.`,
    });
  }

  if (!invoice.attachmentUrl) {
    return err({
      code: 'VALIDATION',
      message: 'Invoice has no attachment URL for OCR processing',
    });
  }

  // 2. Run OCR
  const ocrResult = await ocrClient.analyzeDocument(invoice.attachmentUrl);

  // 3. Store OCR results
  const [storedResult] = await db
    .insert(ocrResults)
    .values({
      tenantId,
      apInvoiceId: invoiceId,
      extractedVendor: ocrResult.vendor,
      extractedInvoiceNumber: ocrResult.invoiceNumber,
      extractedDate: ocrResult.date,
      extractedDueDate: ocrResult.dueDate,
      extractedTotal: ocrResult.total != null ? String(ocrResult.total) : null,
      extractedSubtotal: ocrResult.subtotal != null ? String(ocrResult.subtotal) : null,
      extractedTax: ocrResult.tax != null ? String(ocrResult.tax) : null,
      extractedPoNumber: ocrResult.poNumber,
      extractedLineItems: ocrResult.lineItems,
      fieldConfidences: ocrResult.fieldConfidences,
      rawResponse: ocrResult as unknown as Record<string, unknown>,
      processedAt: new Date(),
    })
    .returning();

  if (!storedResult) {
    return err({ code: 'INTERNAL', message: 'Failed to store OCR results' });
  }

  // 4. Update invoice with extracted data
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (ocrResult.invoiceNumber) {
    updateData.invoiceNumber = ocrResult.invoiceNumber;
  }
  if (ocrResult.date) {
    updateData.invoiceDate = new Date(ocrResult.date);
  }
  if (ocrResult.dueDate) {
    updateData.dueDate = new Date(ocrResult.dueDate);
  }
  if (ocrResult.total != null) {
    updateData.totalAmount = ocrResult.total;
  }
  if (ocrResult.subtotal != null) {
    updateData.subtotal = ocrResult.subtotal;
  }
  if (ocrResult.tax != null) {
    updateData.taxAmount = ocrResult.tax;
  }

  // 5. Calculate overall confidence and determine status
  const confidences = Object.values(ocrResult.fieldConfidences);
  const allHighConfidence = confidences.length > 0 && confidences.every((c) => c >= CONFIDENCE_THRESHOLD);
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;

  const newStatus = allHighConfidence ? 'coding_ready' : 'review';
  updateData.status = newStatus === 'coding_ready' ? 'coding' : 'review';
  updateData.ocrConfidence = String(avgConfidence.toFixed(4));

  await db
    .update(apInvoices)
    .set(updateData)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)));

  // Insert extracted line items
  if (ocrResult.lineItems.length > 0) {
    const lineValues = ocrResult.lineItems.map((item, idx) => ({
      tenantId,
      apInvoiceId: invoiceId,
      lineNumber: idx + 1,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    }));

    await db.insert(apInvoiceLines).values(lineValues);
  }

  // 6. Auto-match PO if extracted with high confidence
  if (
    ocrResult.poNumber &&
    (ocrResult.fieldConfidences['poNumber'] ?? 0) >= PO_CONFIDENCE_THRESHOLD
  ) {
    // PO matching is best-effort — don't fail the OCR job if it errors
    try {
      await matchToPO(tenantId, invoiceId, ocrResult.poNumber);
    } catch {
      // PO match failure is non-fatal — invoice proceeds to coding/review
    }
  }

  // 7. Apply coding rules if status is coding-ready
  if (updateData.status === 'coding') {
    try {
      await applyCodingRules(tenantId, invoiceId);
    } catch {
      // Coding rule failure is non-fatal
    }
  }

  return ok({ status: updateData.status as string, ocrResultId: storedResult.id });
}
