import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { sodRules } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface CreateSodRuleInput {
  ruleKey: string;
  description: string;
  entityType: string;
  actionA: string;
  actionB: string;
}

export async function listSodRules(tenantId: string): Promise<Result<typeof sodRules.$inferSelect[], AppError>> {
  try {
    const rows = await db.select().from(sodRules)
      .where(and(eq(sodRules.tenantId, tenantId), eq(sodRules.isActive, true)));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list SOD rules', details: { error: e } });
  }
}

export async function createSodRule(
  tenantId: string,
  input: CreateSodRuleInput,
): Promise<Result<typeof sodRules.$inferSelect, AppError>> {
  try {
    const [row] = await db.insert(sodRules).values({ tenantId, ...input }).returning();
    if (!row) return err({ code: 'INTERNAL', message: 'Insert returned no row' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to create SOD rule', details: { error: e } });
  }
}

export async function updateSodRule(
  tenantId: string,
  id: string,
  input: Partial<CreateSodRuleInput>,
): Promise<Result<typeof sodRules.$inferSelect, AppError>> {
  try {
    const [row] = await db.update(sodRules).set({ ...input, updatedAt: new Date() })
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'SOD rule not found' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to update SOD rule', details: { error: e } });
  }
}

export async function deleteSodRule(
  tenantId: string,
  id: string,
): Promise<Result<void, AppError>> {
  try {
    const [row] = await db.update(sodRules).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'SOD rule not found' });
    return ok(undefined);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to delete SOD rule', details: { error: e } });
  }
}

// Check if user A performing action on an entity would conflict with user B's prior action
// Returns the conflicting rule if one exists, null otherwise
export async function checkSodConflict(
  tenantId: string,
  entityType: string,
  actionA: string,
  actionB: string,
): Promise<typeof sodRules.$inferSelect | null> {
  const rows = await db.select().from(sodRules)
    .where(and(eq(sodRules.tenantId, tenantId), eq(sodRules.isActive, true), eq(sodRules.entityType, entityType)));
  return rows.find((r) =>
    (r.actionA === actionA && r.actionB === actionB) ||
    (r.actionA === actionB && r.actionB === actionA),
  ) ?? null;
}
