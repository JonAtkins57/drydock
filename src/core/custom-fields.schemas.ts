import { z } from 'zod';

export const DATA_TYPES = [
  'text', 'long_text', 'numeric', 'currency', 'date', 'datetime',
  'boolean', 'single_select', 'multi_select', 'reference', 'formula', 'attachment_ref',
] as const;

export type DataType = (typeof DATA_TYPES)[number];

// ── Validation rules schema ──────────────────────────────────────
export const validationRulesSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  picklistId: z.string().uuid().optional(),
}).strict().optional();

// ── Field definition schemas ─────────────────────────────────────
export const createFieldDefinitionSchema = z.object({
  entityType: z.string().min(1).max(100),
  fieldKey: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'fieldKey must be snake_case'),
  displayName: z.string().min(1).max(255),
  dataType: z.enum(DATA_TYPES),
  isRequired: z.boolean().default(false),
  defaultValue: z.string().nullish(),
  defaultSource: z.record(z.unknown()).nullish(),
  validationRules: validationRulesSchema.nullish(),
  fieldGroup: z.string().max(100).nullish(),
  sortOrder: z.number().int().nonnegative().default(0),
  helpText: z.string().max(1000).nullish(),
  effectiveFrom: z.string().datetime().nullish(),
  effectiveTo: z.string().datetime().nullish(),
  securityConfig: z.record(z.unknown()).nullish(),
  glPostingBehavior: z.record(z.unknown()).nullish(),
});

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>;

export const updateFieldDefinitionSchema = createFieldDefinitionSchema
  .omit({ entityType: true, fieldKey: true, dataType: true })
  .partial();

export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>;

export const listFieldDefinitionsQuerySchema = z.object({
  entityType: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

// ── Field value schemas ──────────────────────────────────────────
export const setFieldValueSchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  value: z.any(),
});

export interface SetFieldValueInput {
  fieldDefinitionId: string;
  value: unknown;
}

export const setFieldValuesSchema = z.array(setFieldValueSchema).min(1);

// ── Picklist schemas ─────────────────────────────────────────────
export const createPicklistSchema = z.object({
  listKey: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'listKey must be snake_case'),
  displayName: z.string().min(1).max(255),
});

export type CreatePicklistInput = z.infer<typeof createPicklistSchema>;

export const updatePicklistSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePicklistInput = z.infer<typeof updatePicklistSchema>;

export const createPicklistValueSchema = z.object({
  valueKey: z.string().min(1).max(100),
  displayValue: z.string().min(1).max(255),
  sortOrder: z.number().int().nonnegative().default(0),
  isDefault: z.boolean().default(false),
});

export type CreatePicklistValueInput = z.infer<typeof createPicklistValueSchema>;

export const updatePicklistValueSchema = z.object({
  displayValue: z.string().min(1).max(255).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePicklistValueInput = z.infer<typeof updatePicklistValueSchema>;
