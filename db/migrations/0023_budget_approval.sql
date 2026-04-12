-- Migration: budget approval state machine (SY-376)
-- Adds status enum + approval/rejection tracking columns to annual_budgets

CREATE TYPE drydock_planning.budget_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'voided'
);

ALTER TABLE drydock_planning.annual_budgets
  ADD COLUMN status drydock_planning.budget_status NOT NULL DEFAULT 'draft',
  ADD COLUMN approved_by  UUID,
  ADD COLUMN approved_at  TIMESTAMPTZ,
  ADD COLUMN rejected_by  UUID,
  ADD COLUMN rejected_at  TIMESTAMPTZ;
