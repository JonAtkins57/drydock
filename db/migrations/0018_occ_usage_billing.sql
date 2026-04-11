-- OCC Usage-Based Billing tables in drydock_integration schema

CREATE TABLE IF NOT EXISTS drydock_integration.occ_rate_cards (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  name              text NOT NULL,
  meter_type        text NOT NULL,
  unit_price_cents  integer NOT NULL,
  currency          text NOT NULL DEFAULT 'USD',
  description       text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);

CREATE INDEX IF NOT EXISTS idx_occ_rate_cards_tenant_meter
  ON drydock_integration.occ_rate_cards (tenant_id, meter_type)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS drydock_integration.occ_pull_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  integration_config_id uuid NOT NULL,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  raw_usage             jsonb,
  usage_summary         jsonb,
  total_amount_cents    integer,
  invoice_id            uuid,
  error_message         text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  created_by            uuid
);

CREATE INDEX IF NOT EXISTS idx_occ_pull_runs_tenant_config
  ON drydock_integration.occ_pull_runs (tenant_id, integration_config_id, started_at DESC);

CREATE TABLE IF NOT EXISTS drydock_integration.occ_usage_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  pull_run_id        uuid NOT NULL REFERENCES drydock_integration.occ_pull_runs(id),
  meter_type         text NOT NULL,
  rate_card_id       uuid,
  quantity           numeric(20, 6) NOT NULL,
  unit_price_cents   integer NOT NULL,
  total_amount_cents integer NOT NULL,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occ_usage_lines_pull_run
  ON drydock_integration.occ_usage_lines (pull_run_id);
