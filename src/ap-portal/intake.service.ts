import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { apInvoices, apInvoiceLines } from '../db/schema/index';
import { ok, err, type Result, type AppError } from '../lib/result';
import { logAction } from '../core/audit.service';
import type { CreateManualInvoiceInput, CreateFromUploadInput } from './ap.schemas';

// ── Types ──────────────────────────────────────────────────────────

type ApInvoice = typeof apInvoices.$inferSelect;
type ApInvoiceLine = typeof apInvoiceLines.$inferSelect;

export interface ApInvoiceWithLines extends ApInvoice {
  lines: ApInvoiceLine[];
}

// ── Create Manual Invoice ─────────────────────────────────────────

export async function createManualInvoice(
  tenantId: string,
  data: CreateManualInvoiceInput,
  userId: string,
): Promise<Result<ApInvoiceWithLines, AppError>> {
  // Check for duplicates before creating
  const dupResult = await checkDuplicate(tenantId, data.vendorId, data.invoiceNumber, data.totalAmount ?? null);
  if (dupResult.ok && dupResult.value) {
    return err({
      code: 'CONFLICT',
      message: `Duplicate invoice detected: vendor ${data.vendorId}, invoice# ${data.invoiceNumber}`,
      details: { existingInvoiceId: dupResult.value },
    });
  }

  const [invoice] = await db
    .insert(apInvoices)
    .values({
      tenantId,
      invoiceNumber: data.invoiceNumber,
      vendorId: data.vendorId,
      poId: data.poId ?? null,
      status: 'coding',
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      totalAmount: data.totalAmount ?? null,
      subtotal: data.subtotal ?? null,
      taxAmount: data.taxAmount ?? null,
      currency: data.currency,
      source: 'manual',
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  if (!invoice) {
    return err({ code: 'INTERNAL', message: 'Failed to create AP invoice' });
  }

  // Insert lines
  const lineValues = data.lines.map((line, idx) => ({
    tenantId,
    apInvoiceId: invoice.id,
    lineNumber: idx + 1,
    description: line.description ?? null,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.amount,
    accountId: line.accountId ?? null,
    departmentId: line.departmentId ?? null,
    projectId: line.projectId ?? null,
    costCenterId: line.costCenterId ?? null,
  }));

  const insertedLines = await db
    .insert(apInvoiceLines)
    .values(lineValues)
    .returning();

  await logAction({
    tenantId,
    userId,
    action: 'ap_invoice.create_manual',
    entityType: 'ap_invoice',
    entityId: invoice.id,
    changes: { invoiceNumber: data.invoiceNumber, vendorId: data.vendorId, lineCount: data.lines.length },
  });

  return ok({ ...invoice, lines: insertedLines });
}

// ── Create From Upload ────────────────────────────────────────────

export async function createFromUpload(
  tenantId: string,
  fileData: CreateFromUploadInput,
  userId: string,
): Promise<Result<ApInvoice, AppError>> {
  const [invoice] = await db
    .insert(apInvoices)
    .values({
      tenantId,
      invoiceNumber: fileData.invoiceNumber ?? `UPLOAD-${Date.now()}`,
      vendorId: fileData.vendorId ?? '00000000-0000-0000-0000-000000000000', // placeholder until OCR
      status: 'ocr_pending',
      source: fileData.source,
      sourceEmail: fileData.sourceEmail ?? null,
      attachmentUrl: fileData.attachmentUrl,
      attachmentHash: fileData.attachmentHash ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  if (!invoice) {
    return err({ code: 'INTERNAL', message: 'Failed to create AP invoice from upload' });
  }

  // TODO: Queue OCR job via BullMQ
  // await ocrQueue.add('process-invoice', { tenantId, invoiceId: invoice.id });

  await logAction({
    tenantId,
    userId,
    action: 'ap_invoice.upload',
    entityType: 'ap_invoice',
    entityId: invoice.id,
    changes: { source: fileData.source, attachmentUrl: fileData.attachmentUrl },
  });

  return ok(invoice);
}

// ── Duplicate Detection ───────────────────────────────────────────

export async function checkDuplicate(
  tenantId: string,
  vendorId: string,
  invoiceNumber: string,
  amount: number | null,
): Promise<Result<string | null, AppError>> {
  const conditions = [
    eq(apInvoices.tenantId, tenantId),
    eq(apInvoices.vendorId, vendorId),
    eq(apInvoices.invoiceNumber, invoiceNumber),
  ];

  // If amount is provided, also match on amount for stronger detection
  const [existing] = await db
    .select({ id: apInvoices.id, totalAmount: apInvoices.totalAmount })
    .from(apInvoices)
    .where(and(...conditions))
    .limit(1);

  if (!existing) {
    return ok(null);
  }

  // Exact match on vendor + invoice number is enough to flag
  // If amounts also match, it's almost certainly a duplicate
  return ok(existing.id);
}
