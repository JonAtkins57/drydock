-- Add DocuSign envelope tracking columns to quotes
ALTER TABLE drydock_q2c.quotes
  ADD COLUMN IF NOT EXISTS docusign_envelope_id TEXT,
  ADD COLUMN IF NOT EXISTS docusign_status      TEXT;

-- Index for webhook envelope lookups (cross-tenant)
CREATE INDEX IF NOT EXISTS idx_quotes_docusign_envelope_id
  ON drydock_q2c.quotes (docusign_envelope_id)
  WHERE docusign_envelope_id IS NOT NULL;

-- DocuSign envelope tracking table
DO $$ BEGIN
  CREATE TYPE drydock_q2c.docusign_envelope_status AS ENUM (
    'sent', 'delivered', 'completed', 'voided', 'declined'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS drydock_q2c.docusign_envelopes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  quote_id          UUID NOT NULL REFERENCES drydock_q2c.quotes(id),
  envelope_id       TEXT NOT NULL UNIQUE,
  status            drydock_q2c.docusign_envelope_status NOT NULL,
  recipients_config JSONB NOT NULL,
  s3_key_signed_doc TEXT,
  sent_by           UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docusign_envelopes_tenant_id
  ON drydock_q2c.docusign_envelopes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_docusign_envelopes_quote_id
  ON drydock_q2c.docusign_envelopes (quote_id);
