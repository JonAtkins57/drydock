import { pgSchema, uuid, text, boolean, jsonb, integer, timestamp, bigint, numeric, date } from 'drizzle-orm/pg-core';

export const integrationSchema = pgSchema('drydock_integration');

export const integrationConfigs = integrationSchema.table('integration_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  integrationType: text('integration_type').notNull(),
  name: text('name').notNull(),
  config: jsonb('config'),
  syncSchedule: text('sync_schedule'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationFieldMappings = integrationSchema.table('integration_field_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  integrationConfigId: uuid('integration_config_id').notNull().references(() => integrationConfigs.id),
  sourceField: text('source_field').notNull(),
  targetEntity: text('target_entity').notNull(),
  targetField: text('target_field').notNull(),
  transformRule: text('transform_rule'),
  isActive: boolean('is_active').notNull().default(true),
});

export const integrationSyncLogs = integrationSchema.table('integration_sync_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  integrationConfigId: uuid('integration_config_id').notNull().references(() => integrationConfigs.id),
  syncType: text('sync_type').notNull().default('incremental'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull().default('running'),
  recordsProcessed: integer('records_processed').notNull().default(0),
  recordsFailed: integer('records_failed').notNull().default(0),
  errorDetails: jsonb('error_details'),
});

export const integrationErrorQueue = integrationSchema.table('integration_error_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  syncLogId: uuid('sync_log_id').notNull().references(() => integrationSyncLogs.id),
  sourceRecordId: text('source_record_id'),
  errorType: text('error_type').notNull(),
  errorMessage: text('error_message').notNull(),
  payload: jsonb('payload'),
  retryCount: integer('retry_count').notNull().default(0),
  status: text('status').notNull().default('pending'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
});

export const harvestTimeEntries = integrationSchema.table('harvest_time_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  harvestEntryId: bigint('harvest_entry_id', { mode: 'number' }).notNull(),
  harvestUserId: bigint('harvest_user_id', { mode: 'number' }).notNull(),
  harvestProjectId: bigint('harvest_project_id', { mode: 'number' }).notNull(),
  harvestTaskId: bigint('harvest_task_id', { mode: 'number' }),
  harvestClientId: bigint('harvest_client_id', { mode: 'number' }),
  userName: text('user_name').notNull().default(''),
  userEmail: text('user_email').notNull().default(''),
  projectName: text('project_name').notNull().default(''),
  projectCode: text('project_code').notNull().default(''),
  taskName: text('task_name').notNull().default(''),
  clientName: text('client_name').notNull().default(''),
  spentDate: date('spent_date').notNull(),
  hours: numeric('hours', { precision: 8, scale: 2 }).notNull().default('0'),
  roundedHours: numeric('rounded_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  billable: boolean('billable').notNull().default(false),
  billableRateCents: integer('billable_rate_cents').notNull().default(0),
  costRateCents: integer('cost_rate_cents').notNull().default(0),
  isBilled: boolean('is_billed').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  notes: text('notes'),
  externalRefId: text('external_ref_id').notNull().default(''),
  externalRefUrl: text('external_ref_url').notNull().default(''),
  startedTime: text('started_time'),
  endedTime: text('ended_time'),
  internalProjectId: uuid('internal_project_id'),
  internalEmployeeId: uuid('internal_employee_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const externalKeyMappings = integrationSchema.table('external_key_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  integrationType: text('integration_type').notNull(),
  externalSystem: text('external_system').notNull(),
  externalId: text('external_id').notNull(),
  internalEntityType: text('internal_entity_type').notNull(),
  internalEntityId: uuid('internal_entity_id').notNull(),
});
