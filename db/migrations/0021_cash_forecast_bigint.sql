-- Migration 0021: Cash Forecast — widen money columns to BIGINT and enable RLS
-- Addresses: inflow_cents, outflow_cents, balance_cents were originally INTEGER in 0015.
-- BIGINT is required to safely handle large values without overflow (matches Drizzle schema).

ALTER TABLE drydock_planning.cash_forecast_lines
  ALTER COLUMN inflow_cents TYPE BIGINT USING inflow_cents::bigint,
  ALTER COLUMN outflow_cents TYPE BIGINT USING outflow_cents::bigint;

ALTER TABLE drydock_planning.bank_account_balances
  ALTER COLUMN balance_cents TYPE BIGINT USING balance_cents::bigint;

-- Row Level Security (was omitted from 0015)
ALTER TABLE drydock_planning.cash_forecast_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE drydock_planning.cash_forecast_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE drydock_planning.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drydock_planning.bank_account_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON drydock_planning.cash_forecast_scenarios
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON drydock_planning.cash_forecast_lines
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON drydock_planning.bank_accounts
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON drydock_planning.bank_account_balances
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
