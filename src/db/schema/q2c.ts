import { pgSchema, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const q2cSchema = pgSchema('drydock_q2c');

// ── Enums ─────────────────────────────────────────────────────────

export const quoteStatusEnum = q2cSchema.enum('quote_status', [
  'draft', 'sent', 'accepted', 'rejected', 'expired', 'executed',
]);

export const orderStatusEnum = q2cSchema.enum('order_status', [
  'draft', 'confirmed', 'fulfilled', 'cancelled',
]);

export const invoiceStatusEnum = q2cSchema.enum('invoice_status', [
  'draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited',
]);

export const planTypeEnum = q2cSchema.enum('plan_type', [
  'fixed', 'recurring', 'milestone',
]);

export const billingMethodEnum = q2cSchema.enum('billing_method', [
  'advance', 'arrears',
]);

export const frequencyEnum = q2cSchema.enum('frequency', [
  'monthly', 'quarterly', 'annual', 'one_time',
]);

export const billingPlanStatusEnum = q2cSchema.enum('billing_plan_status', [
  'active', 'paused', 'completed', 'cancelled',
]);

export const scheduleLineStatusEnum = q2cSchema.enum('schedule_line_status', [
  'scheduled', 'invoiced', 'cancelled',
]);

// ── Quotes ────────────────────────────────────────────────────────

export const quotes = q2cSchema.table('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  quoteNumber: text('quote_number').notNull(),
  customerId: uuid('customer_id').notNull(),
  name: text('name').notNull(),
  status: quoteStatusEnum('status').notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  parentQuoteId: uuid('parent_quote_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Quote Lines ───────────────────────────────────────────────────

export const quoteLines = q2cSchema.table('quote_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  accountId: uuid('account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Sales Orders ──────────────────────────────────────────────────

export const salesOrders = q2cSchema.table('sales_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  orderNumber: text('order_number').notNull(),
  customerId: uuid('customer_id').notNull(),
  quoteId: uuid('quote_id'),
  status: orderStatusEnum('status').notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  orderDate: timestamp('order_date', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Order Lines ───────────────────────────────────────────────────

export const orderLines = q2cSchema.table('order_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  orderId: uuid('order_id').notNull().references(() => salesOrders.id),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Invoices ──────────────────────────────────────────────────────

export const invoices = q2cSchema.table('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull().defaultNow(),
  paidDate: timestamp('paid_date', { withTimezone: true }),
  paidAmount: integer('paid_amount').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Invoice Lines ─────────────────────────────────────────────────

export const invoiceLines = q2cSchema.table('invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  accountId: uuid('account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Billing Plans ─────────────────────────────────────────────────

export const billingPlans = q2cSchema.table('billing_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  name: text('name').notNull(),
  planType: planTypeEnum('plan_type').notNull(),
  billingMethod: billingMethodEnum('billing_method').notNull(),
  frequency: frequencyEnum('frequency').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  status: billingPlanStatusEnum('status').notNull().default('active'),
  totalAmount: integer('total_amount').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── DocuSign Envelopes ────────────────────────────────────────────

export const docusignEnvelopeStatusEnum = q2cSchema.enum('docusign_envelope_status', [
  'sent', 'delivered', 'completed', 'voided', 'declined',
]);

export const docusignEnvelopes = q2cSchema.table('docusign_envelopes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id),
  envelopeId: text('envelope_id').notNull().unique(),
  status: docusignEnvelopeStatusEnum('status').notNull(),
  recipientsConfig: jsonb('recipients_config').notNull(),
  s3KeySignedDoc: text('s3_key_signed_doc'),
  sentBy: uuid('sent_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Billing Schedule Lines ────────────────────────────────────────

export const billingScheduleLines = q2cSchema.table('billing_schedule_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  billingPlanId: uuid('billing_plan_id').notNull().references(() => billingPlans.id),
  lineNumber: integer('line_number').notNull(),
  billingDate: timestamp('billing_date', { withTimezone: true }).notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  amount: integer('amount').notNull(),
  status: scheduleLineStatusEnum('status').notNull().default('scheduled'),
  invoiceId: uuid('invoice_id'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
