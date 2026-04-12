import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { billingPlans, billingPlanAmendments } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';
import { logAction } from '../core/audit.service.js';

export interface AmendmentInput {
  effectiveDate: Date;
  amendmentType: string;
  changes: Record<string, unknown>;
  notes?: string;
}

export async function listAmendments(
  tenantId: string,
  billingPlanId: string,
): Promise<Result<typeof billingPlanAmendments.$inferSelect[], AppError>> {
  try {
    const rows = await db.select().from(billingPlanAmendments)
      .where(and(eq(billingPlanAmendments.tenantId, tenantId), eq(billingPlanAmendments.billingPlanId, billingPlanId)))
      .orderBy(desc(billingPlanAmendments.newVersion));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list amendments', details: { error: e } });
  }
}

export async function createAmendment(
  tenantId: string,
  userId: string,
  billingPlanId: string,
  input: AmendmentInput,
): Promise<Result<typeof billingPlanAmendments.$inferSelect, AppError>> {
  // Fetch current plan
  const [plan] = await db.select().from(billingPlans)
    .where(and(eq(billingPlans.id, billingPlanId), eq(billingPlans.tenantId, tenantId)));
  if (!plan) return err({ code: 'NOT_FOUND', message: 'Billing plan not found' });
  if (plan.status === 'cancelled') {
    return err({ code: 'BAD_REQUEST', message: 'Cannot amend a cancelled billing plan' });
  }

  // Get the highest existing version for this plan
  const [lastAmendment] = await db.select().from(billingPlanAmendments)
    .where(and(eq(billingPlanAmendments.billingPlanId, billingPlanId), eq(billingPlanAmendments.tenantId, tenantId)))
    .orderBy(desc(billingPlanAmendments.newVersion))
    .limit(1);

  const priorVersion = lastAmendment?.newVersion ?? (plan.version ?? 1);
  const newVersion = priorVersion + 1;

  try {
    // Apply changes to the plan
    const allowedChanges: Record<string, unknown> = {};
    const validFields = ['totalAmount', 'frequency', 'endDate', 'billingMethod'];
    for (const [k, v] of Object.entries(input.changes)) {
      if (validFields.includes(k)) allowedChanges[k] = v;
    }

    await db.transaction(async (tx) => {
      if (Object.keys(allowedChanges).length > 0) {
        await tx.update(billingPlans).set({ ...allowedChanges, version: newVersion, updatedAt: new Date() })
          .where(and(eq(billingPlans.id, billingPlanId), eq(billingPlans.tenantId, tenantId)));
      }
    });

    const [amendment] = await db.insert(billingPlanAmendments).values({
      tenantId,
      billingPlanId,
      effectiveDate: input.effectiveDate,
      amendmentType: input.amendmentType,
      changes: input.changes,
      priorVersion,
      newVersion,
      notes: input.notes ?? null,
      approvedBy: userId,
      approvedAt: new Date(),
      createdBy: userId,
    }).returning();

    await logAction({
      tenantId,
      userId,
      action: 'amend',
      entityType: 'billing_plan',
      entityId: billingPlanId,
      changes: { priorVersion, newVersion, amendmentType: input.amendmentType },
    });

    if (!amendment) return err({ code: 'INTERNAL', message: 'Insert returned no row' });
    return ok(amendment);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to create amendment', details: { error: e } });
  }
}
