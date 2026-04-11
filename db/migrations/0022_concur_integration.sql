-- Migration 0022: SAP Concur Expense Integration
-- Creates concur_expense_mappings table in drydock_integration schema

CREATE TABLE IF NOT EXISTS drydock_integration.concur_expense_mappings (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID        NOT NULL,
  integration_config_id UUID        NOT NULL REFERENCES drydock_integration.integration_configs(id) ON DELETE CASCADE,
  expense_type_code     TEXT        NOT NULL,
  expense_type_name     TEXT,
  debit_account_id      UUID        NOT NULL,
  credit_account_id     UUID,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concur_expense_mappings_config_tenant
  ON drydock_integration.concur_expense_mappings (integration_config_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_concur_expense_mappings_code_config
  ON drydock_integration.concur_expense_mappings (expense_type_code, integration_config_id);
