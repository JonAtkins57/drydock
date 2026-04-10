-- DryDock Schema Bootstrap
-- Run this BEFORE drizzle migrations to create schemas and set up RLS infrastructure

-- ════════════════════════════════════════════════════════════════
-- CREATE SCHEMAS
-- ════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS drydock_core;
CREATE SCHEMA IF NOT EXISTS drydock_master;
CREATE SCHEMA IF NOT EXISTS drydock_crm;
CREATE SCHEMA IF NOT EXISTS drydock_q2c;
CREATE SCHEMA IF NOT EXISTS drydock_p2p;
CREATE SCHEMA IF NOT EXISTS drydock_ap;
CREATE SCHEMA IF NOT EXISTS drydock_gl;
CREATE SCHEMA IF NOT EXISTS drydock_asset;
CREATE SCHEMA IF NOT EXISTS drydock_lease;
CREATE SCHEMA IF NOT EXISTS drydock_inventory;
CREATE SCHEMA IF NOT EXISTS drydock_project;
CREATE SCHEMA IF NOT EXISTS drydock_planning;
CREATE SCHEMA IF NOT EXISTS drydock_integration;
CREATE SCHEMA IF NOT EXISTS drydock_audit;

-- ════════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- needed for exclusion constraints

-- ════════════════════════════════════════════════════════════════
-- RLS INFRASTRUCTURE
-- ════════════════════════════════════════════════════════════════

-- Application sets this on every connection:
--   SET app.current_tenant = '<tenant_id>';
--
-- All RLS policies use: current_setting('app.current_tenant', true)
-- The 'true' flag means return NULL instead of error if not set.

-- Helper function to get current tenant
CREATE OR REPLACE FUNCTION drydock_core.current_tenant_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TIMESTAMP TRIGGER
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION drydock_core.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Macro to apply the trigger to a table:
-- Usage: SELECT drydock_core.add_updated_at_trigger('drydock_master', 'customers');
CREATE OR REPLACE FUNCTION drydock_core.add_updated_at_trigger(schema_name text, table_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION drydock_core.update_updated_at()',
    table_name, schema_name, table_name
  );
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- RLS POLICY HELPER
-- ════════════════════════════════════════════════════════════════

-- Macro to enable RLS and add standard tenant isolation policy:
-- Usage: SELECT drydock_core.add_tenant_rls('drydock_master', 'customers');
CREATE OR REPLACE FUNCTION drydock_core.add_tenant_rls(schema_name text, table_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', schema_name, table_name);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = drydock_core.current_tenant_id()) WITH CHECK (tenant_id = drydock_core.current_tenant_id())',
    schema_name, table_name
  );
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- AUDIT LOG PROTECTION
-- Prevent updates and deletes on the audit log
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION drydock_audit.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Applied after audit_log table is created by Drizzle migration:
-- CREATE TRIGGER no_update_audit BEFORE UPDATE ON drydock_audit.audit_log
--   FOR EACH ROW EXECUTE FUNCTION drydock_audit.prevent_audit_modification();
-- CREATE TRIGGER no_delete_audit BEFORE DELETE ON drydock_audit.audit_log
--   FOR EACH ROW EXECUTE FUNCTION drydock_audit.prevent_audit_modification();

-- ════════════════════════════════════════════════════════════════
-- JOURNAL BALANCE CHECK
-- Enforces debit = credit on journal entries at posting time
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION drydock_gl.check_journal_balance(p_journal_id uuid)
RETURNS boolean AS $$
DECLARE
  v_debit_total bigint;
  v_credit_total bigint;
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_debit_total, v_credit_total
  FROM drydock_gl.journal_entry_lines
  WHERE journal_entry_id = p_journal_id;

  IF v_debit_total != v_credit_total THEN
    RAISE EXCEPTION 'Journal entry % is out of balance: debits=% credits=%',
      p_journal_id, v_debit_total, v_credit_total;
  END IF;

  IF v_debit_total = 0 THEN
    RAISE EXCEPTION 'Journal entry % has no lines', p_journal_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- NUMBERING SEQUENCE HELPER
-- Thread-safe auto-increment for transaction numbers
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION drydock_core.next_number(
  p_tenant_id uuid,
  p_entity_type text
)
RETURNS text AS $$
DECLARE
  v_prefix text;
  v_current integer;
  v_pad integer;
BEGIN
  UPDATE drydock_core.numbering_sequences
  SET current_value = current_value + 1
  WHERE tenant_id = p_tenant_id AND entity_type = p_entity_type
  RETURNING prefix, current_value, pad_width
  INTO v_prefix, v_current, v_pad;

  IF NOT FOUND THEN
    INSERT INTO drydock_core.numbering_sequences (tenant_id, entity_type, prefix, current_value, pad_width)
    VALUES (p_tenant_id, p_entity_type, UPPER(LEFT(p_entity_type, 3)) || '-', 1, 6)
    RETURNING prefix, current_value, pad_width
    INTO v_prefix, v_current, v_pad;
  END IF;

  RETURN v_prefix || LPAD(v_current::text, v_pad, '0');
END;
$$ LANGUAGE plpgsql;
