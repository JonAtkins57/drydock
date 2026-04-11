-- Migration 0015: Cash Forecast Module
-- Schema: drydock_planning (already exists from budgeting migration)

CREATE TYPE drydock_planning.cash_forecast_scenario AS ENUM ('base', 'optimistic', 'pessimistic');

CREATE TABLE drydock_planning.cash_forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  scenario drydock_planning.cash_forecast_scenario NOT NULL DEFAULT 'base',
  window_start DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE drydock_planning.cash_forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  scenario_id UUID NOT NULL REFERENCES drydock_planning.cash_forecast_scenarios(id),
  week_start DATE NOT NULL,
  inflow_cents INTEGER NOT NULL DEFAULT 0,
  outflow_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE drydock_planning.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  account_number TEXT,
  institution TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE drydock_planning.bank_account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES drydock_planning.bank_accounts(id),
  balance_date DATE NOT NULL,
  balance_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX idx_cash_forecast_scenarios_tenant_id ON drydock_planning.cash_forecast_scenarios(tenant_id);
CREATE INDEX idx_cash_forecast_lines_scenario_id ON drydock_planning.cash_forecast_lines(scenario_id);
CREATE INDEX idx_cash_forecast_lines_week_start ON drydock_planning.cash_forecast_lines(week_start);
CREATE INDEX idx_bank_accounts_tenant_id ON drydock_planning.bank_accounts(tenant_id);
CREATE INDEX idx_bank_account_balances_bank_account_id ON drydock_planning.bank_account_balances(bank_account_id);
CREATE INDEX idx_bank_account_balances_balance_date ON drydock_planning.bank_account_balances(balance_date);
