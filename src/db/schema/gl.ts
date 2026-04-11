import { pgSchema, uuid, text, boolean, jsonb, integer, bigint, timestamp } from 'drizzle-orm/pg-core';
import { legalEntities, departments, locations, customers, vendors, projects, costCenters } from './master.js';

export const glSchema = pgSchema('drydock_gl');

export const accounts = glSchema.table('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  accountNumber: text('account_number').notNull(),
  name: text('name').notNull(),
  accountType: text('account_type').notNull(),
  accountSubtype: text('account_subtype'),
  parentAccountId: uuid('parent_account_id'),
  isPostingAccount: boolean('is_posting_account').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  normalBalance: text('normal_balance').notNull().default('debit'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const accountingPeriods = glSchema.table('accounting_periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  periodName: text('period_name').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  periodNumber: integer('period_number').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = glSchema.table('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  journalNumber: text('journal_number').notNull(),
  journalType: text('journal_type').notNull().default('manual'),
  periodId: uuid('period_id').notNull().references(() => accountingPeriods.id),
  postingDate: timestamp('posting_date', { withTimezone: true }).notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'),
  sourceModule: text('source_module'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: uuid('source_entity_id'),
  createdBy: uuid('created_by'),
  approvedBy: uuid('approved_by'),
  postedBy: uuid('posted_by'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  reversedByJournalId: uuid('reversed_by_journal_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntryLines = glSchema.table('journal_entry_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
  lineNumber: integer('line_number').notNull(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  debitAmount: bigint('debit_amount', { mode: 'number' }).notNull().default(0),
  creditAmount: bigint('credit_amount', { mode: 'number' }).notNull().default(0),
  description: text('description'),
  departmentId: uuid('department_id').references(() => departments.id),
  locationId: uuid('location_id').references(() => locations.id),
  customerId: uuid('customer_id').references(() => customers.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  projectId: uuid('project_id').references(() => projects.id),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  customDimensions: jsonb('custom_dimensions'),
});

export const closeChecklists = glSchema.table('close_checklists', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  periodId: uuid('period_id').notNull().references(() => accountingPeriods.id),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const closeChecklistItems = glSchema.table('close_checklist_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  checklistId: uuid('checklist_id').notNull().references(() => closeChecklists.id),
  itemType: text('item_type').notNull(),
  label: text('label').notNull(),
  assigneeId: uuid('assignee_id'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  status: text('status').notNull().default('open'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const recurringJournalTemplates = glSchema.table('recurring_journal_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  frequency: text('frequency').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  nextRunDate: timestamp('next_run_date', { withTimezone: true }).notNull(),
  autoPost: boolean('auto_post').notNull().default(false),
  createReversal: boolean('create_reversal').notNull().default(false),
  status: text('status').notNull().default('active'),
  notificationEmails: jsonb('notification_emails').notNull().default([]),
  generatedCount: integer('generated_count').notNull().default(0),
  lastErrorMessage: text('last_error_message'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recurringJournalTemplateLines = glSchema.table('recurring_journal_template_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id').notNull().references(() => recurringJournalTemplates.id),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  debitAmount: bigint('debit_amount', { mode: 'number' }).notNull().default(0),
  creditAmount: bigint('credit_amount', { mode: 'number' }).notNull().default(0),
  description: text('description'),
  departmentId: uuid('department_id').references(() => departments.id),
  locationId: uuid('location_id').references(() => locations.id),
  customerId: uuid('customer_id').references(() => customers.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  projectId: uuid('project_id').references(() => projects.id),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  customDimensions: jsonb('custom_dimensions'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
