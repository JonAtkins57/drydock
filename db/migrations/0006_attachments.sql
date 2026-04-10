CREATE TABLE IF NOT EXISTS drydock_core.attachments (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  filename    TEXT        NOT NULL,
  s3_key      TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL,
  size_bytes  INTEGER     NOT NULL,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
