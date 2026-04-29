-- =======================================================
-- MIGRACIÓN COMPLETA — ejecutar en Neon/Supabase SQL Editor
-- Incluye: pagos por org, api_keys, horarios por plantilla
-- =======================================================

-- 1. Columnas de pago y WhatsApp en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payphone_token       TEXT,
  ADD COLUMN IF NOT EXISTS payphone_store_id    TEXT,
  ADD COLUMN IF NOT EXISTS payphone_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wapi_token           TEXT,
  ADD COLUMN IF NOT EXISTS wapi_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS wapi_from_number     TEXT;

-- 2. Tabla api_keys
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

-- 3. Tabla availability_schedules (plantillas de horario)
CREATE TYPE IF NOT EXISTS schedule_type AS ENUM ('NORMAL', 'HOLIDAY', 'VACATION', 'CUSTOM');

CREATE TABLE IF NOT EXISTS availability_schedules (
  id               TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  TEXT          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id  TEXT          NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name             TEXT          NOT NULL,           -- ej: "Semana normal", "Feriados", "Vacaciones julio"
  schedule_type    schedule_type NOT NULL DEFAULT 'NORMAL',
  is_default       BOOLEAN       NOT NULL DEFAULT false,
  valid_from       DATE,                             -- NULL = sin limite de inicio
  valid_to         DATE,                             -- NULL = sin limite de fin
  active           BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_professional ON availability_schedules(professional_id);
CREATE INDEX IF NOT EXISTS idx_schedules_org          ON availability_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedules_active       ON availability_schedules(professional_id, active);

-- 4. Vincular availability_rules a una plantilla (opcional, retrocompatible)
ALTER TABLE availability_rules
  ADD COLUMN IF NOT EXISTS schedule_id TEXT REFERENCES availability_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rules_schedule ON availability_rules(schedule_id);
