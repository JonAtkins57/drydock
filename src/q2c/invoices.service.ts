import { eq, and, sql, desc, lte, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { invoices, invoiceLines } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  PaginatedResponse,
} from './q2c.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceLineRow = typeof invoiceLines.$inferSelect;

interface InvoiceWithLines extends InvoiceRow {
  lines: InvoiceLineRow[];
}

// ── Create Invoice ─────────────────────────────────────────────────

async function createInvoice(
  tenantId: string,
  data: CreateInvoiceInput,
  userId: string,
): Promise<Result<InvoiceWithLines, AppError>> {
  const numResult = await generateNumber(tenantId, 'invoice');
  if (!numResult.ok) return numResult;

  const totalAmount = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const rows = await db
    .insert(invoices)
    .values({
      tenantId,
      invoiceNumber: numResult.value,
      customerId: data.customerId,
      orderId: data.orderId ?? null,
      status: 'draft',
      totalAmount,
      taxAmount: data.taxAmount ?? 0,
      dueDate: new Date(data.dueDate),
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const inv = rows[0];
  if (!inv) return err({ code: 'INTERNAL', message: 'Failed to create invoice' });

  const lineValues = data.lines.map((l, idx) => ({
    tenantId,
    invoiceId: inv.id,
    lineNumber: idx + 1,
    itemId: l.itemId ?? null,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.quantity * l.unitPrice,
    accountId: l.accountId ?? null,
  }));

  const lines = await db.insert(invoiceLines).values(lineValues).returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'invoice',
    entityId: inv.id,
    changes: { lineCount: data.lines.length },
  });

  return ok({ ...inv, lines });
}

// ── Get Invoice ────────────────────────────────────────────────────

async function getInvoice(
  tenantId: string,
  id: string,
): Promise<Result<InvoiceWithLines, AppError>> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
    .limit(1);

  const inv = rows[0];
  if (!inv) return err({ code: 'NOT_FOUND', message: `Invoice '${id}' not found` });

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, id), eq(invoiceLines.tenantId, tenantId)));

  return ok({ ...inv, lines });
}

// ── List Invoices ──────────────────────────────────────────────────

async function listInvoices(
  tenantId: string,
  options: ListInvoicesQuery,
): Promise<Result<PaginatedResponse<InvoiceRow>, AppError>> {
  const { page, pageSize, status, customerId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(invoices.tenantId, tenantId)];
  if (status) conditions.push(eq(invoices.status, status));
  if (customerId) conditions.push(eq(invoices.customerId, customerId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(whereClause),
    db.select().from(invoices).where(whereClause).orderBy(desc(invoices.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Send Invoice ───────────────────────────────────────────────────

async function sendInvoice(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<InvoiceRow, AppError>> {
  const existing = await getInvoice(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    return err({ code: 'CONFLICT', message: `Invoice can only be sent from draft status, current: ${existing.value.status}` });
  }

  const rows = await db
    .update(invoices)
    .set({ status: 'sent', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) return err({ code: 'INTERNAL', message: 'Failed to send invoice' });

  await logAction({ tenantId, userId, action: 'send', entityType: 'invoice', entityId: id });

  return ok(row);
}

// ── Record Payment ─────────────────────────────────────────────────

async function recordPayment(
  tenantId: string,
  id: string,
  amount: number,
  userId: string,
): Promise<Result<InvoiceRow, AppError>> {
  const existing = await getInvoice(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'sent' && existing.value.status !== 'overdue') {
    return err({ code: 'CONFLICT', message: `Payment can only be recorded on sent or overdue invoices, current: ${existing.value.status}` });
  }

  const newPaidAmount = existing.value.paidAmount + amount;
  const fullyPaid = newPaidAmount >= existing.value.totalAmount;

  const updateData: Record<string, unknown> = {
    paidAmount: newPaidAmount,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (fullyPaid) {
    updateData['status'] = 'paid';
    updateData['paidDate'] = new Date();
  }

  const rows = await db
    .update(invoices)
    .set(updateData)
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) return err({ code: 'INTERNAL', message: 'Failed to record payment' });

  await logAction({
    tenantId,
    userId,
    action: 'record_payment',
    entityType: 'invoice',
    entityId: id,
    changes: { amount, newPaidAmount, fullyPaid },
  });

  return ok(row);
}

// ── AR Aging Report ────────────────────────────────────────────────

interface AgingBucket {
  bucket: string;
  count: number;
  totalAmount: number;
  totalOutstanding: number;
}

async function getAgingReport(
  tenantId: string,
): Promise<Result<AgingBucket[], AppError>> {
  const now = new Date();

  // Get all unpaid invoices (sent or overdue)
  const unpaid = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        sql`${invoices.status} IN ('sent', 'overdue')`,
      ),
    );

  const buckets: Record<string, { count: number; totalAmount: number; totalOutstanding: number }> = {
    current: { count: 0, totalAmount: 0, totalOutstanding: 0 },
    '1-30': { count: 0, totalAmount: 0, totalOutstanding: 0 },
    '31-60': { count: 0, totalAmount: 0, totalOutstanding: 0 },
    '61-90': { count: 0, totalAmount: 0, totalOutstanding: 0 },
    '90+': { count: 0, totalAmount: 0, totalOutstanding: 0 },
  };

  for (const inv of unpaid) {
    const dueDate = inv.dueDate instanceof Date ? inv.dueDate : new Date(inv.dueDate);
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const outstanding = inv.totalAmount - inv.paidAmount;

    let bucket: string;
    if (daysOverdue <= 0) {
      bucket = 'current';
    } else if (daysOverdue <= 30) {
      bucket = '1-30';
    } else if (daysOverdue <= 60) {
      bucket = '31-60';
    } else if (daysOverdue <= 90) {
      bucket = '61-90';
    } else {
      bucket = '90+';
    }

    const b = buckets[bucket]!;
    b.count += 1;
    b.totalAmount += inv.totalAmount;
    b.totalOutstanding += outstanding;
  }

  const result: AgingBucket[] = Object.entries(buckets).map(([bucket, data]) => ({
    bucket,
    ...data,
  }));

  return ok(result);
}

export const invoiceService = {
  createInvoice,
  getInvoice,
  listInvoices,
  sendInvoice,
  recordPayment,
  getAgingReport,
};
