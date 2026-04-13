-- Migration 0027: Harvest time entries table
-- Stores imported time entries from Harvest API v2.
-- Linked to internal employees/projects via external_key_mappings where available.

CREATE TABLE IF NOT EXISTS drydock_integration.harvest_time_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL,
  -- Harvest native identifiers
  harvest_entry_id    BIGINT      NOT NULL,
  harvest_user_id     BIGINT      NOT NULL,
  harvest_project_id  BIGINT      NOT NULL,
  harvest_task_id     BIGINT,
  harvest_client_id   BIGINT,
  -- Denormalized names (snapshot at time of sync)
  user_name           TEXT        NOT NULL DEFAULT '',
  user_email          TEXT        NOT NULL DEFAULT '',
  project_name        TEXT        NOT NULL DEFAULT '',
  project_code        TEXT        NOT NULL DEFAULT '',
  task_name           TEXT        NOT NULL DEFAULT '',
  client_name         TEXT        NOT NULL DEFAULT '',
  -- Time data
  spent_date          DATE        NOT NULL,
  hours               NUMERIC(8,2) NOT NULL DEFAULT 0,
  rounded_hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Billing
  billable            BOOLEAN     NOT NULL DEFAULT false,
  billable_rate_cents INTEGER     NOT NULL DEFAULT 0,
  cost_rate_cents     INTEGER     NOT NULL DEFAULT 0,
  is_billed           BOOLEAN     NOT NULL DEFAULT false,
  is_locked           BOOLEAN     NOT NULL DEFAULT false,
  -- Notes / external ref
  notes               TEXT,
  external_ref_id     TEXT        NOT NULL DEFAULT '',
  external_ref_url    TEXT        NOT NULL DEFAULT '',
  started_time        TEXT,
  ended_time          TEXT,
  -- Internal linkages (resolved during sync, nullable if not found)
  internal_project_id UUID,   -- drydock_master.projects.id
  internal_employee_id UUID,  -- drydock_master.employees.id
  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS harvest_time_entries_tenant_harvest_entry
  ON drydock_integration.harvest_time_entries (tenant_id, harvest_entry_id);

CREATE INDEX IF NOT EXISTS harvest_time_entries_tenant_project
  ON drydock_integration.harvest_time_entries (tenant_id, harvest_project_id);

CREATE INDEX IF NOT EXISTS harvest_time_entries_tenant_user
  ON drydock_integration.harvest_time_entries (tenant_id, harvest_user_id);

CREATE INDEX IF NOT EXISTS harvest_time_entries_spent_date
  ON drydock_integration.harvest_time_entries (tenant_id, spent_date);

CREATE INDEX IF NOT EXISTS harvest_time_entries_internal_project
  ON drydock_integration.harvest_time_entries (internal_project_id)
  WHERE internal_project_id IS NOT NULL;
