import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { activities } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateActivityInput,
  ListActivitiesQuery,
  PaginatedResponse,
} from './crm.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type ActivityRow = typeof activities.$inferSelect;

// ── Create Activity ────────────────────────────────────────────────

export async function createActivity(
  tenantId: string,
  data: CreateActivityInput,
  userId: string,
): Promise<Result<ActivityRow, AppError>> {
  const rows = await db
    .insert(activities)
    .values({
      tenantId,
      activityType: data.activityType,
      subject: data.subject,
      description: data.description ?? null,
      entityType: data.entityType,
      entityId: data.entityId,
      assignedTo: data.assignedTo ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      isCompleted: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create activity' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'activity',
    entityId: row.id,
    changes: data as Record<string, unknown>,
  });

  return ok(row);
}

// ── List Activities for Entity ─────────────────────────────────────

export async function listActivities(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<Result<ActivityRow[], AppError>> {
  const rows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, entityType),
        eq(activities.entityId, entityId),
      ),
    )
    .orderBy(desc(activities.createdAt));

  return ok(rows);
}

// ── Complete Activity ──────────────────────────────────────────────

export async function completeActivity(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<ActivityRow, AppError>> {
  const existing = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))
    .limit(1);

  const row = existing[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Activity '${id}' not found` });
  }

  if (row.isCompleted) {
    return err({ code: 'CONFLICT', message: `Activity '${id}' is already completed` });
  }

  const now = new Date();
  const updated = await db
    .update(activities)
    .set({
      isCompleted: true,
      completedAt: now,
      updatedBy: userId,
      updatedAt: now,
    })
    .where(and(eq(activities.id, id), eq(activities.tenantId, tenantId)))
    .returning();

  const result = updated[0];
  if (!result) {
    return err({ code: 'INTERNAL', message: 'Failed to complete activity' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'complete',
    entityType: 'activity',
    entityId: id,
  });

  return ok(result);
}

// ── List My Activities ─────────────────────────────────────────────

export async function listMyActivities(
  tenantId: string,
  userId: string,
  options: ListActivitiesQuery,
): Promise<Result<PaginatedResponse<ActivityRow>, AppError>> {
  const { page, pageSize, activityType, isCompleted } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [
    eq(activities.tenantId, tenantId),
    eq(activities.assignedTo, userId),
  ];
  if (activityType) conditions.push(eq(activities.activityType, activityType));
  if (isCompleted !== undefined) conditions.push(eq(activities.isCompleted, isCompleted));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(whereClause),
    db
      .select()
      .from(activities)
      .where(whereClause)
      .orderBy(desc(activities.createdAt))
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

export const activityService = {
  createActivity,
  listActivities,
  completeActivity,
  listMyActivities,
};
