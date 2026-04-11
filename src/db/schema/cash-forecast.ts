import { pgSchema, uuid, text, integer, boolean, date, timestamp } from 'drizzle-orm/pg-core';
import { planningSchema } from './budgeting.js';

// Re-export planningSchema so consumers don't need to import budgeting.ts directly
export { planningSchema };

// ── Enums ─────────────────────────────────────────────────────────

export const cashForecastScenarioEnum = planningSchema.enum('cash_forecast_scenario', [
  'base', 'optimistic', 'pessimistic',
]);

// ── Cash Forecast Scenarios ────────────────────────────────────────

export const cashForecastScenarios = planningSchema.table('cash_forecast_scenarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  scenario: cashForecastScenarioEnum('scenario').notNull().default('base'),
  windowStart: date('window_start').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Cash Forecast Lines ────────────────────────────────────────────

export const cashForecastLines = planningSchema.table('cash_forecast_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  scenarioId: uuid('scenario_id').notNull().references(() => cashForecastScenarios.id),
  weekStart: date('week_start').notNull(),
  inflowCents: integer('inflow_cents').notNull().default(0),
  outflowCents: integer('outflow_cents').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Bank Accounts ──────────────────────────────────────────────────

export const bankAccounts = planningSchema.table('bank_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  accountNumber: text('account_number'),
  institution: text('institution'),
  currency: text('currency').notNull().default('USD'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Bank Account Balances ──────────────────────────────────────────

export const bankAccountBalances = planningSchema.table('bank_account_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  balanceDate: date('balance_date').notNull(),
  balanceCents: integer('balance_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
