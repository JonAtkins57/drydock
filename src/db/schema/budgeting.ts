import { pgSchema, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
// Cross-schema FKs to drydock_master omitted — referenced as uuid() only per master.ts convention

export const planningSchema = pgSchema('drydock_planning');

// ── Enums ─────────────────────────────────────────────────────────

export const budgetScenarioEnum = planningSchema.enum('budget_scenario', [
  'base', 'optimistic', 'pessimistic',
]);

// ── Annual Budgets ─────────────────────────────────────────────────

export const annualBudgets = planningSchema.table('annual_budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  name: text('name').notNull(),
  scenario: budgetScenarioEnum('scenario').notNull().default('base'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Budget Lines ───────────────────────────────────────────────────

export const budgetLines = planningSchema.table('budget_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  budgetId: uuid('budget_id').notNull().references(() => annualBudgets.id),
  // FK to drydock_master.departments.id — cross-schema, typed as uuid only
  departmentId: uuid('department_id').notNull(),
  // FK to drydock_gl.accounts.id — cross-schema, typed as uuid only
  accountId: uuid('account_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Forecasts ──────────────────────────────────────────────────────

export const forecasts = planningSchema.table('forecasts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  // nullable — forecast can exist without a budget
  budgetId: uuid('budget_id'),
  fiscalYear: integer('fiscal_year').notNull(),
  periodNumber: integer('period_number').notNull(),
  // FK to drydock_master.departments.id — cross-schema, typed as uuid only
  departmentId: uuid('department_id').notNull(),
  // FK to drydock_gl.accounts.id — cross-schema, typed as uuid only
  accountId: uuid('account_id').notNull(),
  forecastAmountCents: integer('forecast_amount_cents').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
