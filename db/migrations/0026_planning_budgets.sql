-- Migration 0026: Planning — Annual Budgets, Budget Lines, Forecasts
-- Creates the base budgeting tables for drydock_planning.
-- NOTE: 0023_budget_approval.sql was an ALTER TABLE written before this base
--       migration existed; it is now a no-op since these tables are created
--       here with all columns already included.

-- Schema already created by 0015_cash_forecast.sql
-- CREATE SCHEMA IF NOT EXISTS drydock_planning;

CREATE TYPE drydock_planning.budget_scenario AS ENUM (
  'base', 'optimistic', 'pessimistic'
);

CREATE TYPE drydock_planning.budget_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'rejected', 'voided'
);

CREATE TABLE IF NOT EXISTS drydock_planning.annual_budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  fiscal_year    INTEGER NOT NULL,
  name           TEXT NOT NULL,
  scenario       drydock_planning.budget_scenario NOT NULL DEFAULT 'base',
  status         drydock_planning.budget_status NOT NULL DEFAULT 'draft',
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID,
  approved_by    UUID,
  approved_at    TIMESTAMPTZ,
  rejected_by    UUID,
  rejected_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS drydock_planning.budget_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  budget_id      UUID NOT NULL REFERENCES drydock_planning.annual_budgets(id),
  department_id  UUID NOT NULL,
  account_id     UUID NOT NULL,
  amount_cents   INTEGER NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID
);

CREATE TABLE IF NOT EXISTS drydock_planning.forecasts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  budget_id             UUID,
  fiscal_year           INTEGER NOT NULL,
  period_number         INTEGER NOT NULL,
  department_id         UUID NOT NULL,
  account_id            UUID NOT NULL,
  forecast_amount_cents INTEGER NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID
);

CREATE INDEX IF NOT EXISTS idx_annual_budgets_tenant_id     ON drydock_planning.annual_budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_annual_budgets_fiscal_year   ON drydock_planning.annual_budgets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_id       ON drydock_planning.budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_tenant_id       ON drydock_planning.budget_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_tenant_id          ON drydock_planning.forecasts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_fiscal_year        ON drydock_planning.forecasts(fiscal_year);
