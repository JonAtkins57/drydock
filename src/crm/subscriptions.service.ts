import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { subscriptions } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ListSubscriptionsQuery,
  PaginatedResponse,
} from './crm.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type SubscriptionRow = typeof subscriptions.$inferSelect;

// ── Create Subscription ────────────────────────────────────────────

export async function createSubscription(
  tenantId: string,
  data: CreateSubscriptionInput,
  userId: string,
): Promise<Result<SubscriptionRow, AppError>> {
  const rows = await db
    .insert(subscriptions)
    .values({
      tenantId,
      contractId: data.contractId ?? null,
      customerId: data.customerId,
      name: data.name,
      plan: data.plan,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      billingCycle: data.billingCycle,
      status: data.status ?? 'active',
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      billingPlanId: data.billingPlanId ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create subscription' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'subscription',
    entityId: row.id,
    changes: data as Record<string, unknown>,
  });

  return ok(row);
}

// ── Get Subscription ───────────────────────────────────────────────

export async function getSubscription(
  tenantId: string,
  id: string,
): Promise<Result<SubscriptionRow, AppError>> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Subscription '${id}' not found` });
  }

  return ok(row);
}

// ── List Subscriptions ─────────────────────────────────────────────

export async function listSubscriptions(
  tenantId: string,
  options: ListSubscriptionsQuery,
): Promise<Result<PaginatedResponse<SubscriptionRow>, AppError>> {
  const { page, pageSize, status, customerId, contractId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(subscriptions.tenantId, tenantId)];
  if (status) conditions.push(eq(subscriptions.status, status));
  if (customerId) conditions.push(eq(subscriptions.customerId, customerId));
  if (contractId) conditions.push(eq(subscriptions.contractId, contractId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(whereClause),
    db
      .select()
      .from(subscriptions)
      .where(whereClause)
      .orderBy(desc(subscriptions.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// ── Update Subscription ────────────────────────────────────────────

export async function updateSubscription(
  tenantId: string,
  id: string,
  data: UpdateSubscriptionInput,
  userId: string,
): Promise<Result<SubscriptionRow, AppError>> {
  const existing = await getSubscription(tenantId, id);
  if (!existing.ok) return existing;

  const updateData: Record<string, unknown> = { ...data, updatedBy: userId, updatedAt: new Date() };

  if (data.startDate !== undefined) {
    updateData['startDate'] = new Date(data.startDate);
  }
  if (data.endDate !== undefined) {
    updateData['endDate'] = data.endDate ? new Date(data.endDate) : null;
  }

  const rows = await db
    .update(subscriptions)
    .set(updateData)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to update subscription' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'subscription',
    entityId: id,
    changes: { before: existing.value, after: data },
  });

  return ok(row);
}

export const subscriptionService = {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
};
