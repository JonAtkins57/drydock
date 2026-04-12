import { pgSchema, uuid, text, boolean, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';

export const coreSchema = pgSchema('drydock_core');

export const dataTypeEnum = coreSchema.enum('data_type', [
  'text', 'long_text', 'numeric', 'currency', 'date', 'datetime',
  'boolean', 'single_select', 'multi_select', 'reference', 'formula', 'attachment_ref',
]);

export const customFieldDefinitions = coreSchema.table('custom_field_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  fieldKey: text('field_key').notNull(),
  displayName: text('display_name').notNull(),
  dataType: dataTypeEnum('data_type').notNull(),
  isRequired: boolean('is_required').notNull().default(false),
  defaultValue: text('default_value'),
  defaultSource: jsonb('default_source'),
  validationRules: jsonb('validation_rules'),
  fieldGroup: text('field_group'),
  sortOrder: integer('sort_order').notNull().default(0),
  helpText: text('help_text'),
  isActive: boolean('is_active').notNull().default(true),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  securityConfig: jsonb('security_config'),
  glPostingBehavior: jsonb('gl_posting_behavior'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const customFieldValues = coreSchema.table('custom_field_values', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  fieldDefinitionId: uuid('field_definition_id').notNull().references(() => customFieldDefinitions.id),
  valueText: text('value_text'),
  valueNumeric: integer('value_numeric'),
  valueDate: timestamp('value_date', { withTimezone: true }),
  valueBoolean: boolean('value_boolean'),
  valueJson: jsonb('value_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const customTransactionTypeDefinitions = coreSchema.table('custom_transaction_type_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  typeKey: text('type_key').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  basePostingModel: jsonb('base_posting_model'),
  statusWorkflowId: uuid('status_workflow_id'),
  numberingScheme: text('numbering_scheme'),
  permissionsConfig: jsonb('permissions_config'),
  documentTemplateId: uuid('document_template_id'),
  reportingConfig: jsonb('reporting_config'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customTransactionInstances = coreSchema.table('custom_transaction_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  transactionTypeId: uuid('transaction_type_id').notNull().references(() => customTransactionTypeDefinitions.id),
  transactionNumber: text('transaction_number').notNull(),
  status: text('status').notNull().default('draft'),
  headerData: jsonb('header_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const customTransactionLines = coreSchema.table('custom_transaction_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  transactionInstanceId: uuid('transaction_instance_id').notNull().references(() => customTransactionInstances.id),
  lineNumber: integer('line_number').notNull(),
  lineData: jsonb('line_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const picklistDefinitions = coreSchema.table('picklist_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  listKey: text('list_key').notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const picklistValues = coreSchema.table('picklist_values', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  picklistId: uuid('picklist_id').notNull().references(() => picklistDefinitions.id),
  valueKey: text('value_key').notNull(),
  displayValue: text('display_value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowDefinitions = coreSchema.table('workflow_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowStates = coreSchema.table('workflow_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflowDefinitions.id),
  stateKey: text('state_key').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isInitial: boolean('is_initial').notNull().default(false),
  isTerminal: boolean('is_terminal').notNull().default(false),
  entryActions: jsonb('entry_actions'),
  exitActions: jsonb('exit_actions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowTransitions = coreSchema.table('workflow_transitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflowDefinitions.id),
  fromStateId: uuid('from_state_id').notNull().references(() => workflowStates.id),
  toStateId: uuid('to_state_id').notNull().references(() => workflowStates.id),
  transitionKey: text('transition_key').notNull(),
  displayName: text('display_name').notNull(),
  conditions: jsonb('conditions'),
  requiredPermissions: text('required_permissions'),
  actions: jsonb('actions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workflowInstances = coreSchema.table('workflow_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  currentStateId: uuid('current_state_id').notNull().references(() => workflowStates.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const approvalSteps = coreSchema.table('approval_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowTransitionId: uuid('workflow_transition_id').notNull().references(() => workflowTransitions.id),
  stepOrder: integer('step_order').notNull(),
  approvalType: text('approval_type').notNull().default('serial'),
  approverRule: jsonb('approver_rule'),
  timeoutHours: integer('timeout_hours'),
  escalationRule: jsonb('escalation_rule'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvalRecords = coreSchema.table('approval_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  workflowInstanceId: uuid('workflow_instance_id').notNull().references(() => workflowInstances.id),
  approvalStepId: uuid('approval_step_id').notNull().references(() => approvalSteps.id),
  approverId: uuid('approver_id').notNull(),
  decision: text('decision'),
  comments: text('comments'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const numberingSequences = coreSchema.table('numbering_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  prefix: text('prefix').notNull(),
  currentValue: integer('current_value').notNull().default(0),
  padWidth: integer('pad_width').notNull().default(6),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = coreSchema.table('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = coreSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  employeeId: uuid('employee_id'),
  isActive: boolean('is_active').notNull().default(true),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = coreSchema.table('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default([]),
  isSystemRole: boolean('is_system_role').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = coreSchema.table('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  entityId: uuid('entity_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Document Templates ────────────────────────────────────────────

export const documentTemplates = coreSchema.table('document_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateType: text('template_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  htmlContent: text('html_content').notNull(),
  variables: jsonb('variables'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Segregation of Duties Rules ───────────────────────────────────

export const sodRules = coreSchema.table('sod_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  ruleKey: text('rule_key').notNull(),
  description: text('description').notNull(),
  entityType: text('entity_type').notNull(),
  actionA: text('action_a').notNull(),
  actionB: text('action_b').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Workflow Triggers ─────────────────────────────────────────────

export const workflowTriggers = coreSchema.table('workflow_triggers', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflowDefinitions.id),
  triggerType: text('trigger_type').notNull(),
  entityType: text('entity_type').notNull(),
  conditions: jsonb('conditions'),
  actions: jsonb('actions'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = coreSchema.table('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  filename: text('filename').notNull(),
  s3Key: text('s3_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── API Keys ──────────────────────────────────────────────────────
// Raw key is never stored. key_hash = SHA-256(rawKey) hex string.
// A single key can be scoped to multiple tenants.

export const apiKeys = coreSchema.table('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  tenantIds: uuid('tenant_ids').array().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
