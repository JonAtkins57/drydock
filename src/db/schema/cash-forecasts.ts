import { pgSchema, uuid, text, integer, boolean, timestamp, date } from 'drizzle-orm/pg-core';

// Re-use the planningSchema already declared in budgeting.ts — import it from there
import { planningSchema } from './budgeting.js';

export { planningSchema };

// ── Cash Forecast Header ───────────────────────────────────────────

export const cashForecasts = planningSchema.table('cash_forecasts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  // First day of week-1 (always a Monday in practice, but any date is fine)
  startDate: date('start_date').notNull(),
  // Opening cash balance in cents at the start of week 1
  openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Cash Forecast Lines ────────────────────────────────────────────

export const cashForecastLineCategories = [
  'ar_collections',
  'ap_payments',
  'payroll',
  'capex',
  'debt_service',
  'tax_payments',
  'other_inflow',
  'other_outflow',
] as const;

export type CashForecastLineCategory = (typeof cashForecastLineCategories)[number];

export const cashForecastLines = planningSchema.table('cash_forecast_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  forecastId: uuid('forecast_id')
    .notNull()
    .references(() => cashForecasts.id),
  weekNumber: integer('week_number').notNull(), // 1–13
  // Category label — stored as text (no db enum to keep migrations light)
  category: text('category').notNull(),
  description: text('description'),
  // Positive = inflow, negative = outflow (always store the sign)
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
