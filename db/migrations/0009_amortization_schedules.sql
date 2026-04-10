-- Migration: 0009_amortization_schedules
-- Adds expense amortization schedule tables to drydock_ap schema

CREATE TABLE IF NOT EXISTS drydock_ap.amortization_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  ap_invoice_id       UUID REFERENCES drydock_ap.ap_invoices(id),
  description         TEXT,
  total_amount        BIGINT NOT NULL,
  expense_account_id  UUID NOT NULL REFERENCES drydock_gl.accounts(id),
  prepaid_account_id  UUID NOT NULL REFERENCES drydock_gl.accounts(id),
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  frequency           TEXT NOT NULL DEFAULT 'monthly',
  status              TEXT NOT NULL DEFAULT 'active',
  department_id       UUID REFERENCES drydock_master.departments(id),
  project_id          UUID REFERENCES drydock_master.projects(id),
  cost_center_id      UUID REFERENCES drydock_master.cost_centers(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID,
  updated_by          UUID
);

CREATE TABLE IF NOT EXISTS drydock_ap.amortization_schedule_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  schedule_id      UUID NOT NULL REFERENCES drydock_ap.amortization_schedules(id),
  line_number      INTEGER NOT NULL,
  period_date      DATE NOT NULL,
  amount           BIGINT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  journal_entry_id UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amortization_schedules_tenant
  ON drydock_ap.amortization_schedules(tenant_id);

CREATE INDEX IF NOT EXISTS idx_amortization_schedule_lines_schedule
  ON drydock_ap.amortization_schedule_lines(schedule_id);

CREATE INDEX IF NOT EXISTS idx_amortization_schedule_lines_status_date
  ON drydock_ap.amortization_schedule_lines(status, period_date);
