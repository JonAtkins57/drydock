import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { closeChecklists, closeChecklistItems, accountingPeriods } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { logAction } from '../core/audit.service.js';
import type { UpdateChecklistItemInput } from './gl.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type Checklist = typeof closeChecklists.$inferSelect;
type ChecklistItem = typeof closeChecklistItems.$inferSelect;

interface CreateChecklistResult {
  checklist: Checklist;
  items: ChecklistItem[];
}

interface GetChecklistResult {
  checklist: Checklist;
  items: ChecklistItem[];
  summary: {
    total: number;
    open: number;
    inProgress: number;
    reviewed: number;
    signedOff: number;
  };
}

interface SummaryResult {
  checklistId: string;
  periodId: string;
  items: Record<string, ChecklistItem[]>;
  outstandingCount: number;
}

// ── Constants ──────────────────────────────────────────────────────

const ITEM_TYPES = [
  'sub_ledger_rec',
  'bank_rec',
  'ar_aging',
  'ap_aging',
  'fixed_asset_roll',
  'prepaid_roll',
  'accruals_posted',
] as const;

const ITEM_LABELS: Record<string, string> = {
  sub_ledger_rec: 'Sub-Ledger Reconciliation',
  bank_rec: 'Bank Reconciliation',
  ar_aging: 'AR Aging Review',
  ap_aging: 'AP Aging Review',
  fixed_asset_roll: 'Fixed Asset Roll Forward',
  prepaid_roll: 'Prepaid Roll Forward',
  accruals_posted: 'Accruals Posted',
};

const STATUS_ORDER = ['open', 'in_progress', 'reviewed', 'signed_off'];

// ── Create ─────────────────────────────────────────────────────────

export async function createChecklist(
  tenantId: string,
  periodId: string,
  userId: string,
): Promise<Result<CreateChecklistResult, AppError>> {
  // Verify period exists and belongs to tenant
  const [period] = await db
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.tenantId, tenantId), eq(accountingPeriods.id, periodId)))
    .limit(1);

  if (!period) {
    return err({ code: 'NOT_FOUND', message: 'Accounting period not found' });
  }

  // Check if checklist already exists for this period+tenant
  const [existing] = await db
    .select({ id: closeChecklists.id })
    .from(closeChecklists)
    .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.periodId, periodId)))
    .limit(1);

  if (existing) {
    return err({ code: 'CONFLICT', message: 'A close checklist already exists for this period' });
  }

  const [checklist] = await db
    .insert(closeChecklists)
    .values({ tenantId, periodId, createdBy: userId })
    .returning();

  if (!checklist) {
    return err({ code: 'INTERNAL', message: 'Failed to create checklist' });
  }

  const itemValues = ITEM_TYPES.map((itemType) => ({
    tenantId,
    checklistId: checklist.id,
    itemType,
    label: ITEM_LABELS[itemType] ?? itemType,
    status: 'open' as const,
  }));

  const items = await db.insert(closeChecklistItems).values(itemValues).returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'close_checklist',
    entityId: checklist.id,
    changes: { periodId },
  });

  return ok({ checklist, items });
}

// ── Get By Period ──────────────────────────────────────────────────

export async function getChecklistByPeriod(
  tenantId: string,
  periodId: string,
): Promise<Result<GetChecklistResult, AppError>> {
  const [checklist] = await db
    .select()
    .from(closeChecklists)
    .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.periodId, periodId)))
    .limit(1);

  if (!checklist) {
    return err({ code: 'NOT_FOUND', message: 'No close checklist found for this period' });
  }

  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(and(eq(closeChecklistItems.tenantId, tenantId), eq(closeChecklistItems.checklistId, checklist.id)));

  const summary = {
    total: items.length,
    open: items.filter((i) => i.status === 'open').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    reviewed: items.filter((i) => i.status === 'reviewed').length,
    signedOff: items.filter((i) => i.status === 'signed_off').length,
  };

  return ok({ checklist, items, summary });
}

// ── Update Item ────────────────────────────────────────────────────

export async function updateChecklistItem(
  tenantId: string,
  checklistId: string,
  itemId: string,
  data: UpdateChecklistItemInput,
  userId: string,
): Promise<Result<ChecklistItem, AppError>> {
  // Verify checklist belongs to tenant
  const [checklist] = await db
    .select({ id: closeChecklists.id })
    .from(closeChecklists)
    .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.id, checklistId)))
    .limit(1);

  if (!checklist) {
    return err({ code: 'NOT_FOUND', message: 'Checklist not found' });
  }

  // Verify item belongs to checklist and tenant
  const [item] = await db
    .select()
    .from(closeChecklistItems)
    .where(
      and(
        eq(closeChecklistItems.tenantId, tenantId),
        eq(closeChecklistItems.checklistId, checklistId),
        eq(closeChecklistItems.id, itemId),
      ),
    )
    .limit(1);

  if (!item) {
    return err({ code: 'NOT_FOUND', message: 'Checklist item not found' });
  }

  // Validate status only advances (no backward transitions)
  if (data.status !== undefined) {
    const currentIndex = STATUS_ORDER.indexOf(item.status);
    const newIndex = STATUS_ORDER.indexOf(data.status);
    if (newIndex < currentIndex) {
      return err({
        code: 'VALIDATION',
        message: `Status cannot regress from '${item.status}' to '${data.status}'`,
      });
    }
  }

  const updateValues: Partial<typeof closeChecklistItems.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: userId,
  };

  if (data.status !== undefined) updateValues.status = data.status;
  if (data.notes !== undefined) updateValues.notes = data.notes ?? null;
  if (data.assigneeId !== undefined) updateValues.assigneeId = data.assigneeId ?? null;
  if (data.dueDate !== undefined) updateValues.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const [updated] = await db
    .update(closeChecklistItems)
    .set(updateValues)
    .where(
      and(
        eq(closeChecklistItems.tenantId, tenantId),
        eq(closeChecklistItems.id, itemId),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update checklist item' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'close_checklist_item',
    entityId: itemId,
    changes: { before: { status: item.status }, after: { status: updated.status } },
  });

  return ok(updated);
}

// ── Get Summary ────────────────────────────────────────────────────

export async function getChecklistSummary(
  tenantId: string,
  checklistId: string,
): Promise<Result<SummaryResult, AppError>> {
  const [checklist] = await db
    .select()
    .from(closeChecklists)
    .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.id, checklistId)))
    .limit(1);

  if (!checklist) {
    return err({ code: 'NOT_FOUND', message: 'Checklist not found' });
  }

  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(and(eq(closeChecklistItems.tenantId, tenantId), eq(closeChecklistItems.checklistId, checklistId)));

  const grouped: Record<string, ChecklistItem[]> = {
    open: [],
    in_progress: [],
    reviewed: [],
    signed_off: [],
  };

  for (const item of items) {
    const bucket = grouped[item.status];
    if (bucket) {
      bucket.push(item);
    }
  }

  const outstandingCount = items.filter((i) => i.status !== 'signed_off').length;

  return ok({
    checklistId,
    periodId: checklist.periodId,
    items: grouped,
    outstandingCount,
  });
}

// ── Get Items For Period (used by periods.service.ts) ─────────────

export async function getChecklistItemsForPeriod(
  tenantId: string,
  periodId: string,
): Promise<Result<{ items: ChecklistItem[]; hasChecklist: boolean }, AppError>> {
  const [checklist] = await db
    .select()
    .from(closeChecklists)
    .where(and(eq(closeChecklists.tenantId, tenantId), eq(closeChecklists.periodId, periodId)))
    .limit(1);

  if (!checklist) {
    return ok({ items: [], hasChecklist: false });
  }

  const items = await db
    .select()
    .from(closeChecklistItems)
    .where(and(eq(closeChecklistItems.tenantId, tenantId), eq(closeChecklistItems.checklistId, checklist.id)));

  return ok({ items, hasChecklist: true });
}
