-- KPI dashboard layout persistence
-- Creates drydock_reporting schema and dashboard_layouts table

CREATE SCHEMA IF NOT EXISTS drydock_reporting;

CREATE TABLE IF NOT EXISTS drydock_reporting.dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  widgets JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_tenant_user
  ON drydock_reporting.dashboard_layouts (tenant_id, user_id);
