import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  customFieldDefinitions,
  customFieldValues,
} from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  type CreateFieldDefinitionInput,
  type UpdateFieldDefinitionInput,
  type DataType,
} from './custom-fields.schemas.js';

// ── Types ────────────────────────────────────────────────────────
type FieldDefinition = typeof customFieldDefinitions.$inferSelect;
type FieldValue = typeof customFieldValues.$inferSelect;

interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface SetFieldValueInput {
  fieldDefinitionId: string;
  value: unknown;
}

// ── Field Definition CRUD ────────────────────────────────────────

export async function createFieldDefinition(
  tenantId: string,
  data: CreateFieldDefinitionInput,
): Promise<Result<FieldDefinition, AppError>> {
  const parsed = createFieldDefinitionSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid field definition',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  const input = parsed.data;

  // Check for duplicate fieldKey within tenant+entityType
  const existing = await db
    .select({ id: customFieldDefinitions.id })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.entityType, input.entityType),
        eq(customFieldDefinitions.fieldKey, input.fieldKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err({
      code: 'CONFLICT',
      message: `Field key '${input.fieldKey}' already exists for entity type '${input.entityType}'`,
    });
  }

  const [row] = await db
    .insert(customFieldDefinitions)
    .values({
      tenantId,
      entityType: input.entityType,
      fieldKey: input.fieldKey,
      displayName: input.displayName,
      dataType: input.dataType,
      isRequired: input.isRequired,
      defaultValue: input.defaultValue ?? null,
      defaultSource: input.defaultSource ?? null,
      validationRules: input.validationRules ?? null,
      fieldGroup: input.fieldGroup ?? null,
      sortOrder: input.sortOrder,
      helpText: input.helpText ?? null,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      securityConfig: input.securityConfig ?? null,
      glPostingBehavior: input.glPostingBehavior ?? null,
    })
    .returning();

  return ok(row!);
}

export async function getFieldDefinition(
  tenantId: string,
  id: string,
): Promise<Result<FieldDefinition, AppError>> {
  const [row] = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.id, id),
      ),
    )
    .limit(1);

  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Field definition '${id}' not found` });
  }

  return ok(row);
}

export async function listFieldDefinitions(
  tenantId: string,
  entityType?: string,
  options: PaginationOptions = {},
): Promise<Result<PaginatedResult<FieldDefinition>, AppError>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(customFieldDefinitions.tenantId, tenantId)];
  if (entityType) {
    conditions.push(eq(customFieldDefinitions.entityType, entityType));
  }

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(customFieldDefinitions)
      .where(whereClause),
    db
      .select()
      .from(customFieldDefinitions)
      .where(whereClause)
      .orderBy(customFieldDefinitions.sortOrder, customFieldDefinitions.fieldKey)
      .limit(pageSize)
      .offset(offset),
  ]);

  return ok({
    data: rows,
    total: countResult[0]?.count ?? 0,
    page,
    pageSize,
  });
}

export async function updateFieldDefinition(
  tenantId: string,
  id: string,
  data: UpdateFieldDefinitionInput,
): Promise<Result<FieldDefinition, AppError>> {
  const parsed = updateFieldDefinitionSchema.safeParse(data);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION',
      message: 'Invalid update data',
      details: { errors: parsed.error.flatten().fieldErrors },
    });
  }

  // Verify existence
  const existsResult = await getFieldDefinition(tenantId, id);
  if (!existsResult.ok) return existsResult;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const input = parsed.data;

  if (input.displayName !== undefined) updates['displayName'] = input.displayName;
  if (input.isRequired !== undefined) updates['isRequired'] = input.isRequired;
  if (input.defaultValue !== undefined) updates['defaultValue'] = input.defaultValue ?? null;
  if (input.defaultSource !== undefined) updates['defaultSource'] = input.defaultSource ?? null;
  if (input.validationRules !== undefined) updates['validationRules'] = input.validationRules ?? null;
  if (input.fieldGroup !== undefined) updates['fieldGroup'] = input.fieldGroup ?? null;
  if (input.sortOrder !== undefined) updates['sortOrder'] = input.sortOrder;
  if (input.helpText !== undefined) updates['helpText'] = input.helpText ?? null;
  if (input.effectiveFrom !== undefined) updates['effectiveFrom'] = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  if (input.effectiveTo !== undefined) updates['effectiveTo'] = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (input.securityConfig !== undefined) updates['securityConfig'] = input.securityConfig ?? null;
  if (input.glPostingBehavior !== undefined) updates['glPostingBehavior'] = input.glPostingBehavior ?? null;

  const [row] = await db
    .update(customFieldDefinitions)
    .set(updates)
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.id, id),
      ),
    )
    .returning();

  return ok(row!);
}

export async function deactivateFieldDefinition(
  tenantId: string,
  id: string,
): Promise<Result<FieldDefinition, AppError>> {
  const existsResult = await getFieldDefinition(tenantId, id);
  if (!existsResult.ok) return existsResult;

  const [row] = await db
    .update(customFieldDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(customFieldDefinitions.tenantId, tenantId),
        eq(customFieldDefinitions.id, id),
      ),
    )
    .returning();

  return ok(row!);
}

// ── Field Values ─────────────────────────────────────────────────

export async function getFieldValues(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<Result<FieldValue[], AppError>> {
  const rows = await db
    .select()
    .from(customFieldValues)
    .where(
      and(
        eq(customFieldValues.tenantId, tenantId),
        eq(customFieldValues.entityType, entityType),
        eq(customFieldValues.entityId, entityId),
      ),
    );

  return ok(rows);
}

export async function setFieldValue(
  tenantId: string,
  entityType: string,
  entityId: string,
  fieldDefinitionId: string,
  value: unknown,
): Promise<Result<FieldValue, AppError>> {
  // Load definition to validate type
  const defResult = await getFieldDefinition(tenantId, fieldDefinitionId);
  if (!defResult.ok) return defResult;

  const definition = defResult.value;

  // Check entity type matches
  if (definition.entityType !== entityType) {
    return err({
      code: 'VALIDATION',
      message: `Field '${definition.fieldKey}' is defined for '${definition.entityType}', not '${entityType}'`,
    });
  }

  // Validate required
  if (definition.isRequired && (value === null || value === undefined || value === '')) {
    return err({
      code: 'VALIDATION',
      message: `Field '${definition.fieldKey}' is required`,
    });
  }

  // Allow null/undefined to clear a non-required field
  if (value === null || value === undefined) {
    return upsertFieldValue(tenantId, entityType, entityId, fieldDefinitionId, {});
  }

  // Validate and route value to correct column based on data type
  const columnValues = validateAndRouteValue(definition.dataType, value, definition);
  if (!columnValues.ok) return columnValues;

  return upsertFieldValue(tenantId, entityType, entityId, fieldDefinitionId, columnValues.value);
}

export async function setFieldValues(
  tenantId: string,
  entityType: string,
  entityId: string,
  values: SetFieldValueInput[],
): Promise<Result<FieldValue[], AppError>> {
  const results: FieldValue[] = [];

  for (const item of values) {
    const result = await setFieldValue(
      tenantId,
      entityType,
      entityId,
      item.fieldDefinitionId,
      item.value,
    );
    if (!result.ok) return result;
    results.push(result.value);
  }

  return ok(results);
}

// ── Internals ────────────────────────────────────────────────────

interface ColumnValues {
  valueText?: string | null;
  valueNumeric?: number | null;
  valueDate?: Date | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
}

function validateAndRouteValue(
  dataType: DataType,
  value: unknown,
  definition: FieldDefinition,
): Result<ColumnValues, AppError> {
  const rules = (definition.validationRules ?? {}) as Record<string, unknown>;

  switch (dataType) {
    case 'text':
    case 'long_text': {
      if (typeof value !== 'string') {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' expects a string value` });
      }
      const minLen = typeof rules['minLength'] === 'number' ? rules['minLength'] : undefined;
      const maxLen = typeof rules['maxLength'] === 'number' ? rules['maxLength'] : undefined;
      const pattern = typeof rules['pattern'] === 'string' ? rules['pattern'] : undefined;

      if (minLen !== undefined && value.length < minLen) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' must be at least ${minLen} characters` });
      }
      if (maxLen !== undefined && value.length > maxLen) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' must be at most ${maxLen} characters` });
      }
      if (pattern !== undefined) {
        try {
          if (!new RegExp(pattern).test(value)) {
            return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' does not match required pattern` });
          }
        } catch {
          // Invalid regex in rules — skip pattern check
        }
      }
      return ok({ valueText: value });
    }

    case 'numeric':
    case 'currency': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' expects a numeric value` });
      }
      const min = typeof rules['min'] === 'number' ? rules['min'] : undefined;
      const max = typeof rules['max'] === 'number' ? rules['max'] : undefined;
      if (min !== undefined && num < min) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' must be >= ${min}` });
      }
      if (max !== undefined && num > max) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' must be <= ${max}` });
      }
      return ok({ valueNumeric: num });
    }

    case 'date':
    case 'datetime': {
      const dateStr = typeof value === 'string' ? value : String(value);
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' expects a valid date` });
      }
      return ok({ valueDate: d });
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        return err({ code: 'VALIDATION', message: `Field '${definition.fieldKey}' expects a boolean value` });
      }
      return ok({ valueBoolean: value });
    }

    case 'single_select':
    case 'multi_select':
    case 'reference':
    case 'formula':
    case 'attachment_ref': {
      // Store complex types in the JSON column
      return ok({ valueJson: value });
    }

    default:
      return err({ code: 'VALIDATION', message: `Unsupported data type: ${dataType}` });
  }
}

async function upsertFieldValue(
  tenantId: string,
  entityType: string,
  entityId: string,
  fieldDefinitionId: string,
  columns: ColumnValues,
): Promise<Result<FieldValue, AppError>> {
  // Check if value already exists
  const [existing] = await db
    .select({ id: customFieldValues.id })
    .from(customFieldValues)
    .where(
      and(
        eq(customFieldValues.tenantId, tenantId),
        eq(customFieldValues.entityType, entityType),
        eq(customFieldValues.entityId, entityId),
        eq(customFieldValues.fieldDefinitionId, fieldDefinitionId),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(customFieldValues)
      .set({
        valueText: columns.valueText ?? null,
        valueNumeric: columns.valueNumeric ?? null,
        valueDate: columns.valueDate ?? null,
        valueBoolean: columns.valueBoolean ?? null,
        valueJson: columns.valueJson ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customFieldValues.id, existing.id))
      .returning();

    return ok(row!);
  }

  const [row] = await db
    .insert(customFieldValues)
    .values({
      tenantId,
      entityType,
      entityId,
      fieldDefinitionId,
      valueText: columns.valueText ?? null,
      valueNumeric: columns.valueNumeric ?? null,
      valueDate: columns.valueDate ?? null,
      valueBoolean: columns.valueBoolean ?? null,
      valueJson: columns.valueJson ?? null,
    })
    .returning();

  return ok(row!);
}
