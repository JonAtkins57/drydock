import { pgSchema, uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { customers } from './master.js';

export const crmSchema = pgSchema('drydock_crm');

// ── Lead Status ────────────────────────────────────────────────────

export const leadStatusEnum = crmSchema.enum('lead_status', [
  'new', 'contacted', 'qualified', 'converted', 'lost',
]);

// ── Opportunity Stage ──────────────────────────────────────────────

export const opportunityStageEnum = crmSchema.enum('opportunity_stage', [
  'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost',
]);

// ── Activity Type ──────────────────────────────────────────────────

export const activityTypeEnum = crmSchema.enum('activity_type', [
  'task', 'note', 'meeting', 'call', 'email',
]);

// ── Leads ──────────────────────────────────────────────────────────

export const leads = crmSchema.table('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  source: text('source'),
  status: leadStatusEnum('status').notNull().default('new'),
  assignedTo: uuid('assigned_to'),
  convertedOpportunityId: uuid('converted_opportunity_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Opportunities ──────────────────────────────────────────────────

export const opportunities = crmSchema.table('opportunities', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  leadId: uuid('lead_id').references(() => leads.id),
  stage: opportunityStageEnum('stage').notNull().default('prospecting'),
  probability: integer('probability').notNull().default(0),
  expectedAmount: integer('expected_amount').notNull().default(0),
  expectedCloseDate: timestamp('expected_close_date', { withTimezone: true }),
  assignedTo: uuid('assigned_to'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Activities ─────────────────────────────────────────────────────

export const activities = crmSchema.table('activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  activityType: activityTypeEnum('activity_type').notNull(),
  subject: text('subject').notNull(),
  description: text('description'),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  assignedTo: uuid('assigned_to'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  isCompleted: boolean('is_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Contract Status ────────────────────────────────────────────────

export const contractStatusEnum = crmSchema.enum('contract_status', [
  'draft', 'executed', 'active', 'expired', 'terminated',
]);

// ── Subscription Billing Cycle ─────────────────────────────────────

export const subscriptionBillingCycleEnum = crmSchema.enum('subscription_billing_cycle', [
  'monthly', 'quarterly', 'annual', 'one_time',
]);

// ── Subscription Status ────────────────────────────────────────────

export const subscriptionStatusEnum = crmSchema.enum('subscription_status', [
  'active', 'paused', 'cancelled', 'expired',
]);

// ── Contracts ──────────────────────────────────────────────────────

export const contracts = crmSchema.table('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  contractNumber: text('contract_number').notNull(),
  name: text('name').notNull(),
  customerId: uuid('customer_id').notNull(),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id),
  status: contractStatusEnum('status').notNull().default('draft'),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
  expirationDate: timestamp('expiration_date', { withTimezone: true }),
  totalValue: integer('total_value'),
  terms: text('terms'),
  autoRenew: boolean('auto_renew').notNull().default(false),
  renewalNoticeDays: integer('renewal_notice_days'),
  billingPlanId: uuid('billing_plan_id'),
  assignedTo: uuid('assigned_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Contract Lines ─────────────────────────────────────────────────

export const contractLines = crmSchema.table('contract_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  lineNumber: integer('line_number').notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  deliveryTerms: text('delivery_terms'),
  itemId: uuid('item_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Subscriptions ──────────────────────────────────────────────────

export const subscriptions = crmSchema.table('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  contractId: uuid('contract_id'),
  customerId: uuid('customer_id').notNull(),
  name: text('name').notNull(),
  plan: text('plan').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  billingCycle: subscriptionBillingCycleEnum('billing_cycle').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  billingPlanId: uuid('billing_plan_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
