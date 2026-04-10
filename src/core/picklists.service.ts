import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { picklistDefinitions, picklistValues } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import {
  createPicklistSchema,
  updatePicklistSchema,
  createPicklistValueSchema,
  updatePicklistValueSchema,
  type CreatePicklistInput,
  type UpdatePicklistInput,
  type CreatePicklistValueInput,
  type UpdatePicklistValueInput,
} from './custom-fields.schemas.js';

// ── Types ────────────────────────────────────────────────────────
type PicklistDefinition = typeof picklistDefinitions.$inferSelect;
type PicklistValue = typeof picklistValues.$inferSelect;

interface PicklistWithValues extends PicklistDefinition {
  values: PicklistValue[];
}

// ── Picklist Definition CRUD ─────────────────────────────────────

export async function createPicklist(
  tenantId: string,
  data: CreatePicklistInput,
): Promise<Result<PicklistDefinition, AppError>> {
  const parsed = createPicklistSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid picklist data',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  const input = parsed.data;

  // Check duplicate listKey
  const existing = await db
    .select({ id: picklistDefinitions.id })
    .from(picklistDefinitions)
    .where(
      and(
        eq(picklistDefinitions.tenantId, tenantId),
        eq(picklistDefinitions.listKey, input.listKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err({
      code: 'CONFLICT',
      message: `Picklist '${input.listKey}' already exists`,
    });
  }

  const [row] = await db
    .insert(picklistDefinitions)
    .values({
      tenantId,
      listKey: input.listKey,
      displayName: input.displayName,
    })
    .returning();

  return ok(row!);
}

export async function getPicklist(
  tenantId: string,
  id: string,
): Promise<Result<PicklistWithValues, AppError>> {
  const [row] = await db
    .select()
    .from(picklistDefinitions)
    .where(
      and(
        eq(picklistDefinitions.tenantId, tenantId),
        eq(picklistDefinitions.id, id),
      ),
    )
    .limit(1);

  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Picklist '${id}' not found` });
  }

  const vals = await db
    .select()
    .from(picklistValues)
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.picklistId, id),
      ),
    )
    .orderBy(picklistValues.sortOrder, picklistValues.valueKey);

  return ok({ ...row, values: vals });
}

export async function listPicklists(
  tenantId: string,
): Promise<Result<PicklistDefinition[], AppError>> {
  const rows = await db
    .select()
    .from(picklistDefinitions)
    .where(eq(picklistDefinitions.tenantId, tenantId))
    .orderBy(picklistDefinitions.listKey);

  return ok(rows);
}

export async function updatePicklist(
  tenantId: string,
  id: string,
  data: UpdatePicklistInput,
): Promise<Result<PicklistDefinition, AppError>> {
  const parsed = updatePicklistSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid update data',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  // Verify existence
  const [existing] = await db
    .select({ id: picklistDefinitions.id })
    .from(picklistDefinitions)
    .where(
      and(
        eq(picklistDefinitions.tenantId, tenantId),
        eq(picklistDefinitions.id, id),
      ),
    )
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: `Picklist '${id}' not found` });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const input = parsed.data;
  if (input.displayName !== undefined) updates['displayName'] = input.displayName;
  if (input.isActive !== undefined) updates['isActive'] = input.isActive;

  const [row] = await db
    .update(picklistDefinitions)
    .set(updates)
    .where(
      and(
        eq(picklistDefinitions.tenantId, tenantId),
        eq(picklistDefinitions.id, id),
      ),
    )
    .returning();

  return ok(row!);
}

// ── Picklist Value CRUD ──────────────────────────────────────────

export async function addPicklistValue(
  tenantId: string,
  picklistId: string,
  data: CreatePicklistValueInput,
): Promise<Result<PicklistValue, AppError>> {
  const parsed = createPicklistValueSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid picklist value data',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  // Verify picklist exists and belongs to tenant
  const [picklist] = await db
    .select({ id: picklistDefinitions.id })
    .from(picklistDefinitions)
    .where(
      and(
        eq(picklistDefinitions.tenantId, tenantId),
        eq(picklistDefinitions.id, picklistId),
      ),
    )
    .limit(1);

  if (!picklist) {
    return err({ code: 'NOT_FOUND', message: `Picklist '${picklistId}' not found` });
  }

  const input = parsed.data;

  // Check duplicate valueKey within picklist
  const existing = await db
    .select({ id: picklistValues.id })
    .from(picklistValues)
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.picklistId, picklistId),
        eq(picklistValues.valueKey, input.valueKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err({
      code: 'CONFLICT',
      message: `Value key '${input.valueKey}' already exists in this picklist`,
    });
  }

  const [row] = await db
    .insert(picklistValues)
    .values({
      tenantId,
      picklistId,
      valueKey: input.valueKey,
      displayValue: input.displayValue,
      sortOrder: input.sortOrder,
      isDefault: input.isDefault,
    })
    .returning();

  return ok(row!);
}

export async function updatePicklistValue(
  tenantId: string,
  valueId: string,
  data: UpdatePicklistValueInput,
): Promise<Result<PicklistValue, AppError>> {
  const parsed = updatePicklistValueSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid update data',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  const [existing] = await db
    .select({ id: picklistValues.id })
    .from(picklistValues)
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.id, valueId),
      ),
    )
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: `Picklist value '${valueId}' not found` });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const input = parsed.data;
  if (input.displayValue !== undefined) updates['displayValue'] = input.displayValue;
  if (input.sortOrder !== undefined) updates['sortOrder'] = input.sortOrder;
  if (input.isDefault !== undefined) updates['isDefault'] = input.isDefault;
  if (input.isActive !== undefined) updates['isActive'] = input.isActive;

  const [row] = await db
    .update(picklistValues)
    .set(updates)
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.id, valueId),
      ),
    )
    .returning();

  return ok(row!);
}

export async function deactivatePicklistValue(
  tenantId: string,
  valueId: string,
): Promise<Result<PicklistValue, AppError>> {
  const [existing] = await db
    .select({ id: picklistValues.id })
    .from(picklistValues)
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.id, valueId),
      ),
    )
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: `Picklist value '${valueId}' not found` });
  }

  const [row] = await db
    .update(picklistValues)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(picklistValues.tenantId, tenantId),
        eq(picklistValues.id, valueId),
      ),
    )
    .returning();

  return ok(row!);
}
