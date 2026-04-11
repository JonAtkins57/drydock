-- Migration: 0008_recurring_journals
-- Creates recurring journal template tables in drydock_gl schema

CREATE TABLE drydock_gl.recurring_journal_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  frequency           TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  start_date          TIMESTAMPTZ NOT NULL,
  end_date            TIMESTAMPTZ,
  next_run_date       TIMESTAMPTZ NOT NULL,
  auto_post           BOOLEAN NOT NULL DEFAULT FALSE,
  create_reversal     BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'error')),
  notification_emails JSONB NOT NULL DEFAULT '[]',
  generated_count     INTEGER NOT NULL DEFAULT 0,
  last_error_message  TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rjt_tenant_status_next_run
  ON drydock_gl.recurring_journal_templates (tenant_id, status, next_run_date);

CREATE TABLE drydock_gl.recurring_journal_template_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID NOT NULL REFERENCES drydock_gl.recurring_journal_templates(id),
  tenant_id         UUID NOT NULL,
  account_id        UUID NOT NULL REFERENCES drydock_gl.accounts(id),
  debit_amount      BIGINT NOT NULL DEFAULT 0,
  credit_amount     BIGINT NOT NULL DEFAULT 0,
  description       TEXT,
  department_id     UUID,
  location_id       UUID,
  customer_id       UUID,
  vendor_id         UUID,
  project_id        UUID,
  cost_center_id    UUID,
  entity_id         UUID,
  custom_dimensions JSONB,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rjtl_template_active
  ON drydock_gl.recurring_journal_template_lines (template_id, is_active);
