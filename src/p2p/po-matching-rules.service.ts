import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { poMatchingRules } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface CreateMatchingRuleInput {
  vendorId?: string;
  priceTolerance: number;
  qtyTolerance: number;
  allowOverReceipt: boolean;
}

export async function listMatchingRules(tenantId: string): Promise<Result<typeof poMatchingRules.$inferSelect[], AppError>> {
  try {
    const rows = await db.select().from(poMatchingRules)
      .where(and(eq(poMatchingRules.tenantId, tenantId), eq(poMatchingRules.isActive, true)));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list matching rules', details: { error: e } });
  }
}

export async function createMatchingRule(
  tenantId: string,
  userId: string,
  input: CreateMatchingRuleInput,
): Promise<Result<typeof poMatchingRules.$inferSelect, AppError>> {
  try {
    const [row] = await db.insert(poMatchingRules).values({
      tenantId,
      vendorId: input.vendorId ?? null,
      priceTolerance: input.priceTolerance,
      qtyTolerance: input.qtyTolerance,
      allowOverReceipt: input.allowOverReceipt,
      createdBy: userId,
      updatedBy: userId,
    }).returning();
    if (!row) return err({ code: 'INTERNAL', message: 'Insert returned no row' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to create matching rule', details: { error: e } });
  }
}

export async function updateMatchingRule(
  tenantId: string,
  userId: string,
  id: string,
  input: Partial<CreateMatchingRuleInput>,
): Promise<Result<typeof poMatchingRules.$inferSelect, AppError>> {
  try {
    const [row] = await db.update(poMatchingRules)
      .set({ ...input, updatedBy: userId, updatedAt: new Date() })
      .where(and(eq(poMatchingRules.id, id), eq(poMatchingRules.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'Rule not found' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to update matching rule', details: { error: e } });
  }
}

export async function deleteMatchingRule(
  tenantId: string,
  id: string,
): Promise<Result<void, AppError>> {
  try {
    const [row] = await db.update(poMatchingRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(poMatchingRules.id, id), eq(poMatchingRules.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'Rule not found' });
    return ok(undefined);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to delete matching rule', details: { error: e } });
  }
}

// Returns the best-matching rule for a given vendor (vendor-specific first, then global)
export async function getRuleForVendor(
  tenantId: string,
  vendorId: string,
): Promise<typeof poMatchingRules.$inferSelect | null> {
  const rows = await db.select().from(poMatchingRules)
    .where(and(eq(poMatchingRules.tenantId, tenantId), eq(poMatchingRules.isActive, true)));
  const vendorRule = rows.find((r) => r.vendorId === vendorId);
  const globalRule = rows.find((r) => r.vendorId === null);
  return vendorRule ?? globalRule ?? null;
}
