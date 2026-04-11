import { uuid, text, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { integrationSchema } from './integration.js';

// ── OCC Usage Records ─────────────────────────────────────────────
// Stores raw usage events ingested from Oracle Commerce Cloud.
// One record per (subscription, metric, period) granule fetched from OCC.

export const occUsageRecords = integrationSchema.table(
  'occ_usage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    /** Links to drydock_q2c billing_plans or subscriptions via external_key_mappings */
    subscriptionId: uuid('subscription_id').notNull(),
    /** OCC account/site ID from the remote system */
    occAccountId: text('occ_account_id').notNull(),
    /** Metric type reported by OCC (api_calls, orders_processed, transactions, storage_gb, …) */
    metricType: text('metric_type').notNull(),
    /** Raw quantity of usage for this record (unitless integer, context given by metricType) */
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    /** Usage period covered by this record */
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    /** OCC's own record identifier — used for dedup */
    sourceRecordId: text('source_record_id').notNull(),
    /** billing lifecycle status */
    status: text('status').notNull().default('pending_billing'),
    /** Set once a billing invoice line is created for this usage record */
    invoiceLineId: uuid('invoice_line_id'),
    /** Amount billed in cents (quantity × rate), populated when billed */
    billedAmountCents: integer('billed_amount_cents'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('occ_usage_records_tenant_sub_idx').on(t.tenantId, t.subscriptionId),
    index('occ_usage_records_source_idx').on(t.tenantId, t.sourceRecordId),
    index('occ_usage_records_status_idx').on(t.tenantId, t.status),
  ],
);

// ── OCC Billing Configs ───────────────────────────────────────────
// Defines how each metric type is rated for a subscription.
// rate_per_unit_cents × quantity = billed amount for a usage record.

export const occBillingConfigs = integrationSchema.table(
  'occ_billing_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    /** OCC integration config this rate belongs to */
    integrationConfigId: uuid('integration_config_id').notNull(),
    /** Subscription in drydock_q2c this config applies to */
    subscriptionId: uuid('subscription_id').notNull(),
    /** Metric type this rate applies to */
    metricType: text('metric_type').notNull(),
    /** Rate in cents per unit of the metric */
    ratePerUnitCents: integer('rate_per_unit_cents').notNull(),
    /** Optional cap — if set, total billed amount will not exceed this per billing period */
    periodCapCents: integer('period_cap_cents'),
    /** billing_plans id in drydock_q2c to attach generated schedule lines to */
    billingPlanId: uuid('billing_plan_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('occ_billing_configs_tenant_sub_idx').on(t.tenantId, t.subscriptionId),
  ],
);
