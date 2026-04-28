-- Migracion: tabla api_keys para integracion headless
-- Ejecutar en Neon/Supabase SQL Editor

CREATE TABLE IF NOT EXISTS api_keys (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  key_hash         TEXT        UNIQUE NOT NULL,
  key_prefix       TEXT        NOT NULL,
  allowed_origins  TEXT[]      NOT NULL DEFAULT '{}',
  active           BOOLEAN     NOT NULL DEFAULT true,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org    ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(organization_id, active);
