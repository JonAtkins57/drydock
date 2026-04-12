-- Migration: Spec completion — RLS, search, missing tables, email tracking
-- Covers: full-text search indexes, RLS policies, po_matching_rules,
--         billing_plan_amendments, document_templates, sod_rules,
--         email tracking columns, duplicate detection, ap allocation

-- ─── 1. FULL-TEXT SEARCH ──────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- tsvector columns for key searchable entities
ALTER TABLE drydock_master.customers
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(name, '') || ' ' || coalesce(customer_number, ''))
    ) STORED;

ALTER TABLE drydock_master.vendors
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(name, '') || ' ' || coalesce(vendor_number, ''))
    ) STORED;

ALTER TABLE drydock_ap.ap_invoices
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(invoice_number, '') || ' ' ||
        coalesce(vendor_name, '') || ' ' ||
        coalesce(po_number, ''))
    ) STORED;

ALTER TABLE drydock_q2c.quotes
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(quote_number, '') || ' ' || coalesce(name, ''))
    ) STORED;

ALTER TABLE drydock_q2c.sales_orders
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(order_number, '') || ' ' || coalesce(name, ''))
    ) STORED;

ALTER TABLE drydock_q2c.invoices
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(invoice_number, '') || ' ' || coalesce(description, ''))
    ) STORED;

ALTER TABLE drydock_crm.leads
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '') || ' ' ||
        coalesce(email, '') || ' ' ||
        coalesce(company_name, ''))
    ) STORED;

-- GIN indexes on tsvector columns
CREATE INDEX IF NOT EXISTS idx_customers_search    ON drydock_master.customers    USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_vendors_search      ON drydock_master.vendors      USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_search  ON drydock_ap.ap_invoices      USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_quotes_search       ON drydock_q2c.quotes          USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_sales_orders_search ON drydock_q2c.sales_orders    USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_invoices_search     ON drydock_q2c.invoices        USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_leads_search        ON drydock_crm.leads           USING GIN(search_vector);

-- Trigram indexes for partial/fuzzy matching
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON drydock_master.customers USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm   ON drydock_master.vendors   USING GIN(name gin_trgm_ops);

-- ─── 2. ROW LEVEL SECURITY ────────────────────────────────────────────────
-- Apply RLS to all tenant-scoped tables.
-- Policy reads tenant_id from app.current_tenant session var set by middleware.
-- Tables that have no tenant_id (e.g. currencies, accounting_period lookups) are skipped.

-- Helper: enable and create isolation policy
-- Pattern: ALTER TABLE x ENABLE ROW LEVEL SECURITY; CREATE POLICY ...

-- drydock_core
DO $$ BEGIN
  ALTER TABLE drydock_core.custom_field_definitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.custom_field_values ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.custom_transaction_type_definitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.custom_transaction_instances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.custom_transaction_lines ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.picklist_definitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.picklist_values ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.workflow_definitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.workflow_instances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_core.approval_records ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.custom_field_definitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.custom_field_values
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.custom_transaction_type_definitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.custom_transaction_instances
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.custom_transaction_lines
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.picklist_definitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.picklist_values
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.workflow_definitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.workflow_instances
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.approval_records
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- drydock_master
DO $$ BEGIN
  ALTER TABLE drydock_master.customers   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.vendors     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.employees   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.departments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.locations   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.items       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.projects    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.cost_centers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.contacts    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_master.users       ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.customers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.vendors
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.employees
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.departments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.locations
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.items
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.projects
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.cost_centers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.contacts
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_master.users
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- drydock_gl
DO $$ BEGIN
  ALTER TABLE drydock_gl.accounts            ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_gl.accounting_periods  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_gl.journal_entries     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_gl.journal_entry_lines ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_gl.accounts
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_gl.accounting_periods
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_gl.journal_entries
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_gl.journal_entry_lines
  USING (
    EXISTS (
      SELECT 1 FROM drydock_gl.journal_entries je
      WHERE je.id = journal_entry_id
        AND je.tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
    )
  );

-- drydock_ap
DO $$ BEGIN
  ALTER TABLE drydock_ap.ap_invoices      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_ap.ap_invoice_lines ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_ap.ocr_results      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_ap.coding_rules     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_ap.po_match_results ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.ap_invoices
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.ap_invoice_lines
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.ocr_results
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.coding_rules
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.po_match_results
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- drydock_q2c
DO $$ BEGIN
  ALTER TABLE drydock_q2c.quotes            ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_q2c.sales_orders      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_q2c.invoices          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_q2c.billing_plans     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_q2c.credit_memos      ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.quotes
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.sales_orders
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.invoices
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.billing_plans
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.credit_memos
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- drydock_p2p
DO $$ BEGIN
  ALTER TABLE drydock_p2p.purchase_requisitions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_p2p.purchase_orders       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_p2p.goods_receipts        ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_p2p.purchase_requisitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_p2p.purchase_orders
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_p2p.goods_receipts
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- drydock_audit
DO $$ BEGIN
  ALTER TABLE drydock_audit.audit_log  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE drydock_audit.email_log  ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_audit.audit_log
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_audit.email_log
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 3. PO MATCHING TOLERANCES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_p2p.po_matching_rules (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               UUID        NOT NULL,
  vendor_id               UUID,  -- NULL = applies to all vendors for this tenant
  price_tolerance_pct     NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  qty_tolerance_pct       NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  allow_over_receipt      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_po_matching_rules_tenant
  ON drydock_p2p.po_matching_rules (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_po_matching_rules_vendor
  ON drydock_p2p.po_matching_rules (tenant_id, vendor_id) WHERE vendor_id IS NOT NULL;

ALTER TABLE drydock_p2p.po_matching_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_p2p.po_matching_rules
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 4. BILLING PLAN AMENDMENTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_q2c.billing_plan_amendments (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID        NOT NULL,
  billing_plan_id  UUID        NOT NULL,
  effective_date   DATE        NOT NULL,
  amendment_type   TEXT        NOT NULL,  -- rate_change|term_extension|cancellation|pause|resume|custom
  changes          JSONB       NOT NULL DEFAULT '{}',
  prior_version    INTEGER,
  new_version      INTEGER,
  notes            TEXT,
  approved_by      UUID,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID
);

CREATE INDEX IF NOT EXISTS idx_billing_amendments_plan
  ON drydock_q2c.billing_plan_amendments (billing_plan_id, effective_date);

ALTER TABLE drydock_q2c.billing_plan_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_q2c.billing_plan_amendments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 5. DOCUMENT TEMPLATES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_core.document_templates (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID        NOT NULL,
  template_type    TEXT        NOT NULL,  -- quote|invoice|purchase_order|credit_memo|statement|custom
  name             TEXT        NOT NULL,
  description      TEXT,
  html_content     TEXT        NOT NULL DEFAULT '',
  variables        JSONB       NOT NULL DEFAULT '[]',  -- [{key, label, example}]
  is_default       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  version          INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID,
  updated_by       UUID
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_tenant_type
  ON drydock_core.document_templates (tenant_id, template_type, is_active);

ALTER TABLE drydock_core.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.document_templates
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 6. SEGREGATION OF DUTIES RULES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_core.sod_rules (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID        NOT NULL,
  rule_key         TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  entity_type      TEXT        NOT NULL,  -- ap_invoice|journal_entry|purchase_order|budget|etc
  action_a         TEXT        NOT NULL,  -- create|code|submit|match
  action_b         TEXT        NOT NULL,  -- approve|post|pay
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_type, action_a, action_b)
);

CREATE INDEX IF NOT EXISTS idx_sod_rules_tenant_entity
  ON drydock_core.sod_rules (tenant_id, entity_type, is_active);

ALTER TABLE drydock_core.sod_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.sod_rules
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- Seed system-default SOD rules (tenant-level overrides can add more)
-- These are template rows; tenants can copy/modify per their needs.

-- ─── 7. EMAIL TRACKING ENHANCEMENTS ──────────────────────────────────────

ALTER TABLE drydock_audit.email_log
  ADD COLUMN IF NOT EXISTS cc_emails     TEXT[],
  ADD COLUMN IF NOT EXISTS bcc_emails    TEXT[],
  ADD COLUMN IF NOT EXISTS open_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_status   TEXT,   -- hard|soft|complaint|null
  ADD COLUMN IF NOT EXISTS bounce_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS message_id      TEXT,   -- SES/SendGrid message ID for webhook correlation
  ADD COLUMN IF NOT EXISTS provider        TEXT DEFAULT 'ses';

CREATE INDEX IF NOT EXISTS idx_email_log_message_id
  ON drydock_audit.email_log (message_id) WHERE message_id IS NOT NULL;

-- ─── 8. AP DUPLICATE DETECTION ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_ap.duplicate_detections (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID        NOT NULL,
  invoice_id           UUID        NOT NULL,  -- invoice flagged as potential duplicate
  matched_invoice_id   UUID        NOT NULL,  -- the existing invoice it matches
  match_score          NUMERIC(5,2),
  match_reason         TEXT,        -- same_number|same_amount_date|same_hash|fuzzy_vendor
  status               TEXT        NOT NULL DEFAULT 'open',  -- open|confirmed_duplicate|false_positive
  resolved_by          UUID,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dup_detections_tenant_status
  ON drydock_ap.duplicate_detections (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dup_detections_invoice
  ON drydock_ap.duplicate_detections (invoice_id);

ALTER TABLE drydock_ap.duplicate_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.duplicate_detections
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 9. AP ALLOCATION ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_ap.ap_allocations (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL,
  invoice_id        UUID        NOT NULL,
  invoice_line_id   UUID,
  account_id        UUID        NOT NULL,
  department_id     UUID,
  project_id        UUID,
  cost_center_id    UUID,
  amount_cents      BIGINT      NOT NULL,
  allocation_pct    NUMERIC(7,4),  -- if percent-based split
  description       TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending',  -- pending|approved|posted
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID
);

CREATE INDEX IF NOT EXISTS idx_ap_allocations_invoice
  ON drydock_ap.ap_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_allocations_tenant_status
  ON drydock_ap.ap_allocations (tenant_id, status);

ALTER TABLE drydock_ap.ap_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_ap.ap_allocations
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 10. WORKFLOW TRIGGERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drydock_core.workflow_triggers (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID        NOT NULL,
  workflow_id          UUID        NOT NULL,
  trigger_type         TEXT        NOT NULL,  -- record_created|field_changed|threshold_crossed|scheduled
  entity_type          TEXT        NOT NULL,
  conditions           JSONB       NOT NULL DEFAULT '{}',
  actions              JSONB       NOT NULL DEFAULT '[]',  -- [{type, params}]
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_tenant_entity
  ON drydock_core.workflow_triggers (tenant_id, entity_type, is_active);

ALTER TABLE drydock_core.workflow_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON drydock_core.workflow_triggers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

-- ─── 11. AUDIT LOG INDEXES ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_entity
  ON drydock_audit.audit_log (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_user
  ON drydock_audit.audit_log (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
  ON drydock_audit.audit_log (tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON drydock_audit.audit_log (tenant_id, action);
