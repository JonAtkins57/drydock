import { pgSchema, uuid, text, integer, boolean, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core';

export const usageBillingSchema = pgSchema('drydock_integration');

// ── OCC Rate Cards ─────────────────────────────────────────────────
// Locally-stored rate cards that map OCC meter types to per-unit prices.

export const occRateCards = usageBillingSchema.table('occ_rate_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  meterType: text('meter_type').notNull(),
  // unit price in cents per unit of usage
  unitPriceCents: integer('unit_price_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── OCC Pull Runs ─────────────────────────────────────────────────
// Records each pull from the OCC API, the raw usage data, and whether
// an invoice was generated.

export const occPullRuns = usageBillingSchema.table('occ_pull_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  integrationConfigId: uuid('integration_config_id').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  // raw usage data from OCC API response
  rawUsage: jsonb('raw_usage'),
  // total units pulled per meter type: { meterType: unitsDecimal }
  usageSummary: jsonb('usage_summary'),
  // total billed amount in cents
  totalAmountCents: integer('total_amount_cents'),
  // FK to drydock_q2c.invoices — null until invoice is created
  invoiceId: uuid('invoice_id'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
});

// ── OCC Usage Line Items ──────────────────────────────────────────
// Per-meter-type line items rated against the rate card for a run.

export const occUsageLines = usageBillingSchema.table('occ_usage_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  pullRunId: uuid('pull_run_id').notNull().references(() => occPullRuns.id),
  meterType: text('meter_type').notNull(),
  rateCardId: uuid('rate_card_id'),
  // usage quantity as a decimal string (avoid float precision loss)
  quantity: numeric('quantity', { precision: 20, scale: 6 }).notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  // total = quantity * unitPriceCents, rounded to integer cents
  totalAmountCents: integer('total_amount_cents').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
