import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { salesOrders, orderLines, invoices, invoiceLines } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateOrderInput,
  ListOrdersQuery,
  PaginatedResponse,
} from './q2c.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type OrderRow = typeof salesOrders.$inferSelect;
type OrderLineRow = typeof orderLines.$inferSelect;

interface OrderWithLines extends OrderRow {
  lines: OrderLineRow[];
}

// ── Create Order ───────────────────────────────────────────────────

async function createOrder(
  tenantId: string,
  data: CreateOrderInput,
  userId: string,
): Promise<Result<OrderWithLines, AppError>> {
  const numResult = await generateNumber(tenantId, 'sales_order');
  if (!numResult.ok) return numResult;

  const totalAmount = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const rows = await db
    .insert(salesOrders)
    .values({
      tenantId,
      orderNumber: numResult.value,
      customerId: data.customerId,
      quoteId: data.quoteId ?? null,
      status: 'draft',
      totalAmount,
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const order = rows[0];
  if (!order) return err({ code: 'INTERNAL', message: 'Failed to create order' });

  const lineValues = data.lines.map((l, idx) => ({
    tenantId,
    orderId: order.id,
    lineNumber: idx + 1,
    itemId: l.itemId ?? null,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.quantity * l.unitPrice,
  }));

  const lines = await db.insert(orderLines).values(lineValues).returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'sales_order',
    entityId: order.id,
    changes: { lineCount: data.lines.length },
  });

  return ok({ ...order, lines });
}

// ── Get Order ──────────────────────────────────────────────────────

async function getOrder(
  tenantId: string,
  id: string,
): Promise<Result<OrderWithLines, AppError>> {
  const rows = await db
    .select()
    .from(salesOrders)
    .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tenantId)))
    .limit(1);

  const order = rows[0];
  if (!order) return err({ code: 'NOT_FOUND', message: `Order '${id}' not found` });

  const lines = await db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orderId, id), eq(orderLines.tenantId, tenantId)));

  return ok({ ...order, lines });
}

// ── List Orders ────────────────────────────────────────────────────

async function listOrders(
  tenantId: string,
  options: ListOrdersQuery,
): Promise<Result<PaginatedResponse<OrderRow>, AppError>> {
  const { page, pageSize, status, customerId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(salesOrders.tenantId, tenantId)];
  if (status) conditions.push(eq(salesOrders.status, status));
  if (customerId) conditions.push(eq(salesOrders.customerId, customerId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(whereClause),
    db.select().from(salesOrders).where(whereClause).orderBy(desc(salesOrders.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Confirm Order ──────────────────────────────────────────────────

async function confirmOrder(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<OrderRow, AppError>> {
  const existing = await getOrder(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    return err({ code: 'CONFLICT', message: `Order can only be confirmed from draft status, current: ${existing.value.status}` });
  }

  const rows = await db
    .update(salesOrders)
    .set({ status: 'confirmed', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) return err({ code: 'INTERNAL', message: 'Failed to confirm order' });

  await logAction({ tenantId, userId, action: 'confirm', entityType: 'sales_order', entityId: id });

  return ok(row);
}

// ── Generate Invoice from Order ────────────────────────────────────

async function generateInvoice(
  tenantId: string,
  orderId: string,
  userId: string,
): Promise<Result<typeof invoices.$inferSelect, AppError>> {
  const existing = await getOrder(tenantId, orderId);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'confirmed') {
    return err({ code: 'CONFLICT', message: `Invoice can only be generated from confirmed order, current: ${existing.value.status}` });
  }

  const invNumResult = await generateNumber(tenantId, 'invoice');
  if (!invNumResult.ok) return invNumResult;

  // Default due date: 30 days from now
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invRows = await db
    .insert(invoices)
    .values({
      tenantId,
      invoiceNumber: invNumResult.value,
      customerId: existing.value.customerId,
      orderId,
      status: 'draft',
      totalAmount: existing.value.totalAmount,
      taxAmount: 0,
      dueDate,
      notes: existing.value.notes,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const inv = invRows[0];
  if (!inv) return err({ code: 'INTERNAL', message: 'Failed to create invoice' });

  // Copy order lines to invoice lines
  const ilValues = existing.value.lines.map((ol) => ({
    tenantId,
    invoiceId: inv.id,
    lineNumber: ol.lineNumber,
    itemId: ol.itemId ?? null,
    description: ol.description,
    quantity: ol.quantity,
    unitPrice: ol.unitPrice,
    amount: ol.amount,
    accountId: null,
  }));

  if (ilValues.length > 0) {
    await db.insert(invoiceLines).values(ilValues);
  }

  await logAction({
    tenantId,
    userId,
    action: 'generate_invoice',
    entityType: 'sales_order',
    entityId: orderId,
    changes: { invoiceId: inv.id },
  });

  return ok(inv);
}

export const orderService = {
  createOrder,
  getOrder,
  listOrders,
  confirmOrder,
  generateInvoice,
};
