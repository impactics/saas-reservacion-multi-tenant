-- ================================================================
-- SYNC_MISSING_COLUMNS.sql
-- Ejecutar en Neon SQL Editor DESPUÉS de RESET_FULL_SCHEMA.sql
-- Agrega columnas que el schema.prisma tiene pero la DB no.
-- Es idempotente.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. patients: el schema tiene notes y NO tiene el unique phone
--    obligatorio (phone es opcional en el schema)
-- ----------------------------------------------------------------
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- phone puede ser NULL en el schema (String?)
ALTER TABLE "patients"
  ALTER COLUMN "phone" DROP NOT NULL;

-- ----------------------------------------------------------------
-- 2. bookings: patient_phone es opcional en el schema (String?)
-- ----------------------------------------------------------------
ALTER TABLE "bookings"
  ALTER COLUMN "patient_phone" DROP NOT NULL;

-- ----------------------------------------------------------------
-- 3. TABLE: google_calendar_connections (faltaba en RESET)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT        NOT NULL,
    "access_token"    TEXT        NOT NULL,
    "refresh_token"   TEXT,
    "expires_at"      TIMESTAMP(3),
    "calendar_id"     TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_connections_organization_id_key"
  ON "google_calendar_connections"("organization_id");

ALTER TABLE "google_calendar_connections"
  DROP CONSTRAINT IF EXISTS "google_calendar_connections_organization_id_fkey";
ALTER TABLE "google_calendar_connections"
  ADD CONSTRAINT "google_calendar_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 4. VERIFICAR resultado final
-- ----------------------------------------------------------------
-- Ejecuta esto para confirmar:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
--
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'bookings'
-- ORDER BY ordinal_position;
