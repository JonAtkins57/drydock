-- Migration: AP ML Coding Tables
-- Adds coding_suggestions and coding_feedback tables for ML-based GL account suggestions

CREATE TABLE drydock_ap.coding_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ap_invoice_line_id UUID NOT NULL REFERENCES drydock_ap.ap_invoice_lines(id),
  vendor_id UUID NOT NULL,
  description_tokens TEXT NOT NULL,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE drydock_ap.coding_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  suggestion_id UUID NOT NULL REFERENCES drydock_ap.coding_suggestions(id),
  ap_invoice_line_id UUID NOT NULL REFERENCES drydock_ap.ap_invoice_lines(id),
  vendor_id UUID NOT NULL,
  description_tokens TEXT NOT NULL,
  chosen_account_id UUID NOT NULL REFERENCES drydock_gl.accounts(id),
  accepted BOOLEAN NOT NULL,
  accepted_rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coding_feedback_vendor ON drydock_ap.coding_feedback(tenant_id, vendor_id, description_tokens);
CREATE INDEX idx_coding_feedback_account ON drydock_ap.coding_feedback(tenant_id, chosen_account_id);
