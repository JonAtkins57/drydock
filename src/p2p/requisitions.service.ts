import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  purchaseRequisitions,
  requisitionLines,
  purchaseOrders,
  poLines,
} from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { generateNumber } from '../core/numbering.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateRequisitionInput,
  ListRequisitionsQuery,
  ConvertToPOInput,
  PaginatedResponse,
} from './p2p.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type RequisitionRow = typeof purchaseRequisitions.$inferSelect;
type RequisitionLineRow = typeof requisitionLines.$inferSelect;
type RequisitionWithLines = RequisitionRow & { lines: RequisitionLineRow[] };

// ── Create Requisition ─────────────────────────────────────────────

export async function createRequisition(
  tenantId: string,
  data: CreateRequisitionInput,
  userId: string,
): Promise<Result<RequisitionWithLines, AppError>> {
  const numResult = await generateNumber(tenantId, 'requisition');
  if (!numResult.ok) return numResult;

  const totalAmount = data.lines.reduce(
    (sum, line) => sum + line.quantity * line.estimatedUnitPrice,
    0,
  );

  const rows = await db
    .insert(purchaseRequisitions)
    .values({
      tenantId,
      requisitionNumber: numResult.value,
      requestedBy: userId,
      departmentId: data.departmentId ?? null,
      status: 'draft',
      totalAmount,
      notes: data.notes ?? null,
      neededBy: data.neededBy ? new Date(data.neededBy) : null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create requisition' });
  }

  const lineValues = data.lines.map((line, idx) => ({
    tenantId,
    requisitionId: row.id,
    lineNumber: idx + 1,
    itemId: line.itemId ?? null,
    description: line.description,
    quantity: line.quantity,
    estimatedUnitPrice: line.estimatedUnitPrice,
    estimatedAmount: line.quantity * line.estimatedUnitPrice,
    accountId: line.accountId ?? null,
  }));

  const insertedLines = await db
    .insert(requisitionLines)
    .values(lineValues)
    .returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'requisition',
    entityId: row.id,
    changes: { requisitionNumber: row.requisitionNumber, lineCount: data.lines.length },
  });

  return ok({ ...row, lines: insertedLines });
}

// ── Get Requisition ────────────────────────────────────────────────

export async function getRequisition(
  tenantId: string,
  id: string,
): Promise<Result<RequisitionWithLines, AppError>> {
  const rows = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Requisition '${id}' not found` });
  }

  const lines = await db
    .select()
    .from(requisitionLines)
    .where(and(eq(requisitionLines.requisitionId, id), eq(requisitionLines.tenantId, tenantId)));

  return ok({ ...row, lines });
}

// ── List Requisitions ──────────────────────────────────────────────

export async function listRequisitions(
  tenantId: string,
  options: ListRequisitionsQuery,
): Promise<Result<PaginatedResponse<RequisitionRow>, AppError>> {
  const { page, pageSize, status } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(purchaseRequisitions.tenantId, tenantId)];
  if (status) conditions.push(eq(purchaseRequisitions.status, status));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequisitions)
      .where(whereClause),
    db
      .select()
      .from(purchaseRequisitions)
      .where(whereClause)
      .orderBy(desc(purchaseRequisitions.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Submit for Approval ────────────────────────────────────────────

export async function submitForApproval(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<RequisitionRow, AppError>> {
  const existing = await getRequisition(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    return err({
      code: 'CONFLICT',
      message: `Requisition must be in 'draft' status to submit. Current: '${existing.value.status}'`,
    });
  }

  const rows = await db
    .update(purchaseRequisitions)
    .set({ status: 'pending_approval', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to submit requisition' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'submit_for_approval',
    entityType: 'requisition',
    entityId: id,
    changes: { from: 'draft', to: 'pending_approval' },
  });

  return ok(row);
}

// ── Approve Requisition ────────────────────────────────────────────

export async function approveRequisition(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<RequisitionRow, AppError>> {
  const existing = await getRequisition(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'pending_approval') {
    return err({
      code: 'CONFLICT',
      message: `Requisition must be in 'pending_approval' status to approve. Current: '${existing.value.status}'`,
    });
  }

  const rows = await db
    .update(purchaseRequisitions)
    .set({ status: 'approved', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to approve requisition' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'approve',
    entityType: 'requisition',
    entityId: id,
    changes: { from: 'pending_approval', to: 'approved' },
  });

  return ok(row);
}

// ── Convert to PO ──────────────────────────────────────────────────

export async function convertToPO(
  tenantId: string,
  requisitionId: string,
  data: ConvertToPOInput,
  userId: string,
): Promise<Result<typeof purchaseOrders.$inferSelect, AppError>> {
  const existing = await getRequisition(tenantId, requisitionId);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'approved') {
    return err({
      code: 'CONFLICT',
      message: `Requisition must be 'approved' to convert to PO. Current: '${existing.value.status}'`,
    });
  }

  const numResult = await generateNumber(tenantId, 'purchase_order');
  if (!numResult.ok) return numResult;

  const totalAmount = existing.value.lines.reduce(
    (sum, line) => sum + line.estimatedAmount,
    0,
  );

  const poRows = await db
    .insert(purchaseOrders)
    .values({
      tenantId,
      poNumber: numResult.value,
      vendorId: data.vendorId,
      requisitionId,
      status: 'draft',
      totalAmount,
      orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
      expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
      notes: data.notes ?? null,
      paymentTermsId: data.paymentTermsId ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const po = poRows[0];
  if (!po) {
    return err({ code: 'INTERNAL', message: 'Failed to create purchase order from requisition' });
  }

  // Copy requisition lines to PO lines
  const poLineValues = existing.value.lines.map((line, idx) => ({
    tenantId,
    poId: po.id,
    lineNumber: idx + 1,
    itemId: line.itemId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.estimatedUnitPrice,
    amount: line.estimatedAmount,
    accountId: line.accountId,
  }));

  await db.insert(poLines).values(poLineValues);

  await logAction({
    tenantId,
    userId,
    action: 'convert_to_po',
    entityType: 'requisition',
    entityId: requisitionId,
    changes: { poId: po.id, poNumber: po.poNumber },
  });

  return ok(po);
}

export const requisitionService = {
  createRequisition,
  getRequisition,
  listRequisitions,
  submitForApproval,
  approveRequisition,
  convertToPO,
};
