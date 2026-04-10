import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  purchaseOrders,
  poLines,
  goodsReceipts,
  receiptLines,
  emailLog,
  vendors,
  contacts,
} from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { generateNumber } from '../core/numbering.service.js';
import { sendEmail } from '../core/email.service.js';
import { renderPOEmailHtml } from './po-email-template.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreatePOInput,
  ListPOsQuery,
  ReceivePOInput,
  PaginatedResponse,
  ListGoodsReceiptsQuery,
} from './p2p.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type PORow = typeof purchaseOrders.$inferSelect;
type POLineRow = typeof poLines.$inferSelect;
type POWithLines = PORow & { lines: POLineRow[] };
type GoodsReceiptRow = typeof goodsReceipts.$inferSelect;
type ReceiptLineRow = typeof receiptLines.$inferSelect;
type GoodsReceiptWithLines = GoodsReceiptRow & { lines: ReceiptLineRow[] };

// ── Create PO ──────────────────────────────────────────────────────

export async function createPO(
  tenantId: string,
  data: CreatePOInput,
  userId: string,
): Promise<Result<POWithLines, AppError>> {
  const numResult = await generateNumber(tenantId, 'purchase_order');
  if (!numResult.ok) return numResult;

  const totalAmount = data.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );

  const rows = await db
    .insert(purchaseOrders)
    .values({
      tenantId,
      poNumber: numResult.value,
      vendorId: data.vendorId,
      requisitionId: data.requisitionId ?? null,
      status: 'draft',
      totalAmount,
      orderDate: new Date(data.orderDate),
      expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
      notes: data.notes ?? null,
      paymentTermsId: data.paymentTermsId ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create purchase order' });
  }

  const lineValues = data.lines.map((line, idx) => ({
    tenantId,
    poId: row.id,
    lineNumber: idx + 1,
    itemId: line.itemId ?? null,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.quantity * line.unitPrice,
    accountId: line.accountId ?? null,
  }));

  const insertedLines = await db
    .insert(poLines)
    .values(lineValues)
    .returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'purchase_order',
    entityId: row.id,
    changes: { poNumber: row.poNumber, lineCount: data.lines.length },
  });

  return ok({ ...row, lines: insertedLines });
}

// ── Get PO ─────────────────────────────────────────────────────────

export async function getPO(
  tenantId: string,
  id: string,
): Promise<Result<POWithLines, AppError>> {
  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Purchase order '${id}' not found` });
  }

  const lines = await db
    .select()
    .from(poLines)
    .where(and(eq(poLines.poId, id), eq(poLines.tenantId, tenantId)));

  return ok({ ...row, lines });
}

// ── List POs ───────────────────────────────────────────────────────

export async function listPOs(
  tenantId: string,
  options: ListPOsQuery,
): Promise<Result<PaginatedResponse<PORow>, AppError>> {
  const { page, pageSize, status, vendorId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(purchaseOrders.tenantId, tenantId)];
  if (status) conditions.push(eq(purchaseOrders.status, status));
  if (vendorId) conditions.push(eq(purchaseOrders.vendorId, vendorId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(whereClause),
    db
      .select()
      .from(purchaseOrders)
      .where(whereClause)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Approve PO ─────────────────────────────────────────────────────

export async function approvePO(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<PORow, AppError>> {
  const existing = await getPO(tenantId, id);
  if (!existing.ok) return existing;

  const validFrom = ['draft', 'pending_approval'];
  if (!validFrom.includes(existing.value.status)) {
    return err({
      code: 'CONFLICT',
      message: `PO must be in 'draft' or 'pending_approval' status to approve. Current: '${existing.value.status}'`,
    });
  }

  const rows = await db
    .update(purchaseOrders)
    .set({ status: 'approved', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to approve PO' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'approve',
    entityType: 'purchase_order',
    entityId: id,
    changes: { from: existing.value.status, to: 'approved' },
  });

  return ok(row);
}

// ── Dispatch PO ────────────────────────────────────────────────────

export async function dispatchPO(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<PORow, AppError>> {
  const existing = await getPO(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'approved') {
    return err({
      code: 'CONFLICT',
      message: `PO must be 'approved' to dispatch. Current: '${existing.value.status}'`,
    });
  }

  const rows = await db
    .update(purchaseOrders)
    .set({ status: 'dispatched', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to dispatch PO' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'dispatch',
    entityType: 'purchase_order',
    entityId: id,
    changes: { from: 'approved', to: 'dispatched' },
  });

  return ok(row);
}

// ── Receive PO (Goods Receipt) ─────────────────────────────────────

export async function receivePO(
  tenantId: string,
  poId: string,
  data: ReceivePOInput,
  userId: string,
): Promise<Result<GoodsReceiptWithLines, AppError>> {
  const existing = await getPO(tenantId, poId);
  if (!existing.ok) return existing;

  const validStatuses = ['approved', 'dispatched'];
  if (!validStatuses.includes(existing.value.status)) {
    return err({
      code: 'CONFLICT',
      message: `PO must be 'approved' or 'dispatched' to receive. Current: '${existing.value.status}'`,
    });
  }

  // Validate PO line IDs exist on this PO
  const poLineIds = new Set(existing.value.lines.map((l) => l.id));
  for (const rl of data.lines) {
    if (!poLineIds.has(rl.poLineId)) {
      return err({
        code: 'VALIDATION',
        message: `PO line '${rl.poLineId}' does not belong to PO '${poId}'`,
      });
    }
  }

  const numResult = await generateNumber(tenantId, 'goods_receipt');
  if (!numResult.ok) return numResult;

  // Create goods receipt header
  const grRows = await db
    .insert(goodsReceipts)
    .values({
      tenantId,
      receiptNumber: numResult.value,
      poId,
      receivedBy: userId,
      receiptDate: data.receiptDate ? new Date(data.receiptDate) : new Date(),
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const gr = grRows[0];
  if (!gr) {
    return err({ code: 'INTERNAL', message: 'Failed to create goods receipt' });
  }

  // Create receipt lines
  const rlValues = data.lines.map((line) => ({
    tenantId,
    receiptId: gr.id,
    poLineId: line.poLineId,
    quantityReceived: line.quantityReceived,
    notes: line.notes ?? null,
  }));

  const insertedReceiptLines = await db
    .insert(receiptLines)
    .values(rlValues)
    .returning();

  // Update received quantities on PO lines
  for (const line of data.lines) {
    await db
      .update(poLines)
      .set({
        receivedQuantity: sql`${poLines.receivedQuantity} + ${line.quantityReceived}`,
        updatedAt: new Date(),
      })
      .where(and(eq(poLines.id, line.poLineId), eq(poLines.tenantId, tenantId)));
  }

  // Check if all PO lines are fully received → update PO status
  const updatedPOLines = await db
    .select()
    .from(poLines)
    .where(and(eq(poLines.poId, poId), eq(poLines.tenantId, tenantId)));

  const allReceived = updatedPOLines.every((l) => l.receivedQuantity >= l.quantity);
  if (allReceived) {
    await db
      .update(purchaseOrders)
      .set({ status: 'received', updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
  }

  await logAction({
    tenantId,
    userId,
    action: 'receive',
    entityType: 'purchase_order',
    entityId: poId,
    changes: {
      receiptId: gr.id,
      receiptNumber: gr.receiptNumber,
      linesReceived: data.lines.length,
      allReceived,
    },
  });

  return ok({ ...gr, lines: insertedReceiptLines });
}

// ── List Goods Receipts ────────────────────────────────────────────

export async function listGoodsReceipts(
  tenantId: string,
  options: ListGoodsReceiptsQuery,
): Promise<Result<PaginatedResponse<GoodsReceiptRow>, AppError>> {
  const { page, pageSize, poId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(goodsReceipts.tenantId, tenantId)];
  if (poId) conditions.push(eq(goodsReceipts.poId, poId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(goodsReceipts)
      .where(whereClause),
    db
      .select()
      .from(goodsReceipts)
      .where(whereClause)
      .orderBy(desc(goodsReceipts.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Get Goods Receipt ──────────────────────────────────────────────

export async function getGoodsReceipt(
  tenantId: string,
  id: string,
): Promise<Result<GoodsReceiptWithLines, AppError>> {
  const rows = await db
    .select()
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Goods receipt '${id}' not found` });
  }

  const lines = await db
    .select()
    .from(receiptLines)
    .where(and(eq(receiptLines.receiptId, id), eq(receiptLines.tenantId, tenantId)));

  return ok({ ...row, lines });
}

// ── Send PO to Vendor ──────────────────────────────────────────────

export async function sendPOToVendor(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<{ messageId: string; poId: string; sentTo: string }, AppError>> {
  const existing = await getPO(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    return err({
      code: 'CONFLICT',
      message: `PO must be 'draft' to send to vendor. Current: '${existing.value.status}'`,
    });
  }

  const po = existing.value;

  // Resolve vendor
  const vendorRows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, po.vendorId), eq(vendors.tenantId, tenantId)))
    .limit(1);

  const vendor = vendorRows[0];
  if (!vendor) {
    return err({ code: 'NOT_FOUND', message: `Vendor '${po.vendorId}' not found` });
  }

  // Resolve primary contact
  const contactRows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.vendorId, po.vendorId),
        eq(contacts.tenantId, tenantId),
        eq(contacts.isPrimary, true),
        eq(contacts.isActive, true),
      ),
    )
    .limit(1);

  const contact = contactRows[0];
  if (!contact) {
    return err({
      code: 'VALIDATION',
      message: `Vendor '${vendor.name}' has no primary contact`,
    });
  }

  if (!contact.email) {
    return err({
      code: 'VALIDATION',
      message: `Primary contact for vendor '${vendor.name}' has no email address`,
    });
  }

  const recipientEmail = contact.email;

  // Render email
  const html = renderPOEmailHtml({
    poNumber: po.poNumber,
    vendorName: vendor.name,
    orderDate: po.orderDate.toISOString().substring(0, 10),
    expectedDelivery: po.expectedDelivery
      ? po.expectedDelivery.toISOString().substring(0, 10)
      : null,
    lines: po.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    totalAmount: po.totalAmount,
  });

  // Send email first. If it fails, the PO stays 'draft' and the caller can retry.
  // Committing 'sent' before a successful send would leave the PO stuck — the
  // draft→sent guard (line 424) has no retry path for a failed delivery.
  const emailResult = await sendEmail({
    to: recipientEmail,
    subject: `Purchase Order ${po.poNumber} from DryDock`,
    html,
  });

  if (!emailResult.ok) return emailResult;

  const { messageId } = emailResult.value;

  // Email confirmed sent — now commit DB atomically with the known messageId.
  await db.transaction(async (tx) => {
    await tx
      .insert(emailLog)
      .values({ tenantId, poId: id, recipientEmail, sesMessageId: messageId, sentBy: userId });

    await tx
      .update(purchaseOrders)
      .set({ status: 'sent', updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)));
  });

  await logAction({
    tenantId,
    userId,
    action: 'send_to_vendor',
    entityType: 'purchase_order',
    entityId: id,
    changes: { recipientEmail, messageId, from: 'draft', to: 'sent' },
  });

  return ok({ messageId, poId: id, sentTo: recipientEmail });
}

export const purchaseOrderService = {
  createPO,
  getPO,
  listPOs,
  approvePO,
  dispatchPO,
  receivePO,
  listGoodsReceipts,
  getGoodsReceipt,
  sendPOToVendor,
};
