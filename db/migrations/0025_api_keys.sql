-- Migration 0025: API Keys
-- Tenant-scoped API keys for programmatic access.
-- Raw key is never stored — only a SHA-256 hash.
-- A single key can be associated with multiple tenants (tenant_ids uuid[]).

CREATE TABLE IF NOT EXISTS drydock_core.api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  key_hash      text NOT NULL UNIQUE,        -- SHA-256(raw_key) hex string
  tenant_ids    uuid[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  expires_at    timestamptz,                 -- NULL = never expires
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx   ON drydock_core.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_is_active_idx  ON drydock_core.api_keys (is_active);

-- Note: api_keys is NOT tenant-scoped by a single tenant_id column (it spans tenants),
-- so RLS is intentionally not applied here. Access is controlled at the application layer.
