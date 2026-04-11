import { eq, and } from 'drizzle-orm';
import {
  TextractClient,
  AnalyzeExpenseCommand,
  type ExpenseField,
} from '@aws-sdk/client-textract';
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

// ── Real Textract Client ────────────────────────────────────────────

function getFieldValue(fields: ExpenseField[], type: string): { value: string | null; confidence: number } {
  const field = fields.find((f) => f.Type?.Text === type);
  return {
    value: field?.ValueDetection?.Text ?? null,
    confidence: (field?.ValueDetection?.Confidence ?? 0) / 100,
  };
}

export function createTextractClient(
  region?: string,
  credentials?: { accessKeyId: string; secretAccessKey: string },
): OcrClient {
  const client = new TextractClient({
    region: region ?? process.env.AWS_REGION ?? 'us-east-1',
    credentials: credentials ?? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });

  return {
    async analyzeDocument(documentUrl: string): Promise<OcrResult> {
      // documentUrl is an s3:// key — extract bucket/key
      const s3Match = documentUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
      if (!s3Match) {
        throw new Error(`Invalid S3 document URL: ${documentUrl}`);
      }
      const [, bucket, key] = s3Match as [string, string, string];

      const command = new AnalyzeExpenseCommand({
        Document: { S3Object: { Bucket: bucket, Name: key } },
      });

      const response = await client.send(command);
      const summaryFields = response.ExpenseDocuments?.[0]?.SummaryFields ?? [];
      const lineItemGroups = response.ExpenseDocuments?.[0]?.LineItemGroups ?? [];

      const vendor = getFieldValue(summaryFields, 'VENDOR_NAME');
      const invoiceNumber = getFieldValue(summaryFields, 'INVOICE_RECEIPT_ID');
      const date = getFieldValue(summaryFields, 'INVOICE_RECEIPT_DATE');
      const dueDate = getFieldValue(summaryFields, 'DUE_DATE');
      const total = getFieldValue(summaryFields, 'TOTAL');
      const subtotal = getFieldValue(summaryFields, 'SUBTOTAL');
      const tax = getFieldValue(summaryFields, 'TAX');
      const poNumber = getFieldValue(summaryFields, 'PO_NUMBER');
      const paymentTerms = getFieldValue(summaryFields, 'PAYMENT_TERMS');

      const parseAmount = (v: string | null): number | null => {
        if (!v) return null;
        const n = parseFloat(v.replace(/[$,]/g, ''));
        return isNaN(n) ? null : Math.round(n * 100); // to cents
      };

      const lineItems: OcrLineItem[] = [];
      for (const group of lineItemGroups) {
        for (const lineItem of group.LineItems ?? []) {
          const fields = lineItem.LineItemExpenseFields ?? [];
          const desc = fields.find((f) => f.Type?.Text === 'ITEM')?.ValueDetection?.Text ?? '';
          const qty = parseFloat(fields.find((f) => f.Type?.Text === 'QUANTITY')?.ValueDetection?.Text ?? '1');
          const unitPriceRaw = fields.find((f) => f.Type?.Text === 'UNIT_PRICE')?.ValueDetection?.Text ?? '0';
          const amountRaw = fields.find((f) => f.Type?.Text === 'PRICE')?.ValueDetection?.Text ?? '0';
          const unitPrice = Math.round((parseFloat(unitPriceRaw.replace(/[$,]/g, '')) || 0) * 100);
          const amount = Math.round((parseFloat(amountRaw.replace(/[$,]/g, '')) || 0) * 100);
          lineItems.push({ description: desc, quantity: isNaN(qty) ? 1 : qty, unitPrice, amount });
        }
      }

      return {
        vendor: vendor.value,
        invoiceNumber: invoiceNumber.value,
        date: date.value,
        dueDate: dueDate.value,
        total: parseAmount(total.value),
        subtotal: parseAmount(subtotal.value),
        tax: parseAmount(tax.value),
        poNumber: poNumber.value,
        lineItems,
        paymentTerms: paymentTerms.value,
        fieldConfidences: {
          vendor: vendor.confidence,
          invoiceNumber: invoiceNumber.confidence,
          date: date.confidence,
          dueDate: dueDate.confidence,
          total: total.confidence,
          subtotal: subtotal.confidence,
          tax: tax.confidence,
          poNumber: poNumber.confidence,
          lineItems: lineItemGroups.length > 0
            ? (lineItemGroups[0]?.LineItems?.[0]?.LineItemExpenseFields?.[0]?.ValueDetection?.Confidence ?? 0) / 100
            : 0,
        },
      };
    },
  };
}

// ── Stub (kept for test environments) ──────────────────────────────

export function createStubTextractClient(): OcrClient {
  return {
    async analyzeDocument(_documentUrl: string): Promise<OcrResult> {
      return {
        vendor: 'Acme Corp',
        invoiceNumber: 'INV-MOCK-001',
        date: '2026-01-15',
        dueDate: '2026-02-15',
        total: 1500000,
        subtotal: 1350000,
        tax: 150000,
        poNumber: 'PO-12345',
        lineItems: [
          { description: 'Widget A', quantity: 10, unitPrice: 100000, amount: 1000000 },
          { description: 'Widget B', quantity: 5, unitPrice: 70000, amount: 350000 },
        ],
        paymentTerms: 'Net 30',
        fieldConfidences: {
          vendor: 0.95, invoiceNumber: 0.98, date: 0.97, dueDate: 0.92,
          total: 0.99, subtotal: 0.96, tax: 0.94, poNumber: 0.91, lineItems: 0.88,
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
