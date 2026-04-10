import { eq, and, sql, asc, ne } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { accountingPeriods, closeChecklists, closeChecklistItems } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { logAction } from '../core/audit.service.js';
import type { CreatePeriodInput, PeriodStatus } from './gl.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type Period = typeof accountingPeriods.$inferSelect;

// ── Valid status transitions ───────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['soft_close'],
  soft_close: ['closed'],
  closed: ['locked'],
  locked: ['closed'], // Allow unlock for corrections
};

// ── Create ─────────────────────────────────────────────────────────

export async function createPeriod(
  tenantId: string,
  data: CreatePeriodInput,
  userId: string,
): Promise<Result<Period, AppError>> {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (endDate <= startDate) {
    return err({ code: 'VALIDATION', message: 'End date must be after start date' });
  }

  // Check for overlapping periods within same entity scope
  const overlapConditions = [
    eq(accountingPeriods.tenantId, tenantId),
    sql`${accountingPeriods.startDate} < ${endDate.toISOString()}::timestamptz`,
    sql`${accountingPeriods.endDate} > ${startDate.toISOString()}::timestamptz`,
  ];

  if (data.entityId) {
    overlapConditions.push(eq(accountingPeriods.entityId, data.entityId));
  } else {
    overlapConditions.push(sql`${accountingPeriods.entityId} IS NULL`);
  }

  const [overlap] = await db
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(and(...overlapConditions))
    .limit(1);

  if (overlap) {
    return err({
      code: 'CONFLICT',
      message: 'Period overlaps with an existing period',
    });
  }

  const [created] = await db
    .insert(accountingPeriods)
    .values({
      tenantId,
      entityId: data.entityId ?? null,
      periodName: data.periodName,
      startDate,
      endDate,
      fiscalYear: data.fiscalYear,
      periodNumber: data.periodNumber,
      status: 'open',
    })
    .returning();

  if (!created) {
    return err({ code: 'INTERNAL', message: 'Failed to create period' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'accounting_period.create',
    entityType: 'accounting_period',
    entityId: created.id,
    changes: { periodName: data.periodName, fiscalYear: data.fiscalYear },
  });

  return ok(created);
}

// ── List ───────────────────────────────────────────────────────────

export async function listPeriods(
  tenantId: string,
  fiscalYear?: number,
  entityId?: string,
): Promise<Result<Period[], AppError>> {
  const conditions = [eq(accountingPeriods.tenantId, tenantId)];

  if (fiscalYear !== undefined) {
    conditions.push(eq(accountingPeriods.fiscalYear, fiscalYear));
  }

  if (entityId) {
    conditions.push(eq(accountingPeriods.entityId, entityId));
  }

  const periods = await db
    .select()
    .from(accountingPeriods)
    .where(and(...conditions))
    .orderBy(asc(accountingPeriods.fiscalYear), asc(accountingPeriods.periodNumber));

  return ok(periods);
}

// ── Update Status ──────────────────────────────────────────────────

export async function updatePeriodStatus(
  tenantId: string,
  id: string,
  newStatus: PeriodStatus,
  userId: string,
): Promise<Result<Period, AppError>> {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.tenantId, tenantId), eq(accountingPeriods.id, id)))
    .limit(1);

  if (!period) {
    return err({ code: 'NOT_FOUND', message: 'Period not found' });
  }

  const currentStatus = period.status;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus];

  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    return err({
      code: 'VALIDATION',
      message: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowedTransitions?.join(', ') ?? 'none'}`,
    });
  }

  // Gate soft_close → closed: all checklist items must be signed_off (if a checklist exists)
  if (currentStatus === 'soft_close' && newStatus === 'closed') {
    const [checklist] = await db
      .select({ id: closeChecklists.id })
      .from(closeChecklists)
      .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.periodId, id)))
      .limit(1);

    if (checklist) {
      const unsignedItems = await db
        .select({ label: closeChecklistItems.label })
        .from(closeChecklistItems)
        .where(
          and(
            eq(closeChecklistItems.checklistId, checklist.id),
            ne(closeChecklistItems.status, 'signed_off'),
          ),
        );

      if (unsignedItems.length > 0) {
        const labels = unsignedItems.map((i) => i.label).join(', ');
        return err({
          code: 'VALIDATION',
          message: `Cannot close period: the following checklist items are not signed off: ${labels}`,
        });
      }
    }
  }

  const [updated] = await db
    .update(accountingPeriods)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(accountingPeriods.tenantId, tenantId), eq(accountingPeriods.id, id)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update period status' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'accounting_period.status_change',
    entityType: 'accounting_period',
    entityId: id,
    changes: { from: currentStatus, to: newStatus },
  });

  return ok(updated);
}

// ── Get Period For Date ────────────────────────────────────────────

export async function getPeriodForDate(
  tenantId: string,
  date: string,
  entityId?: string,
): Promise<Result<Period, AppError>> {
  const dateTs = new Date(date);

  const conditions = [
    eq(accountingPeriods.tenantId, tenantId),
    sql`${accountingPeriods.startDate} <= ${dateTs.toISOString()}::timestamptz`,
    sql`${accountingPeriods.endDate} >= ${dateTs.toISOString()}::timestamptz`,
  ];

  if (entityId) {
    conditions.push(eq(accountingPeriods.entityId, entityId));
  }

  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(...conditions))
    .limit(1);

  if (!period) {
    return err({
      code: 'NOT_FOUND',
      message: `No accounting period found for date ${date}`,
    });
  }

  return ok(period);
}
