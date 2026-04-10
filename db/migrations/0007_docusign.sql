-- Add DocuSign envelope tracking columns to quotes
ALTER TABLE drydock_q2c.quotes
  ADD COLUMN IF NOT EXISTS docusign_envelope_id TEXT,
  ADD COLUMN IF NOT EXISTS docusign_status      TEXT;

-- Index for webhook envelope lookups (cross-tenant)
CREATE INDEX IF NOT EXISTS idx_quotes_docusign_envelope_id
  ON drydock_q2c.quotes (docusign_envelope_id)
  WHERE docusign_envelope_id IS NOT NULL;
