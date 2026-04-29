-- =============================================================
-- Migración: sincronizar bookings y notification_jobs con el
-- schema.prisma actual (start_time/end_time, enums, columnas)
-- =============================================================

-- ----------------------------------------------------------------
-- 1. ENUMS: actualizar BookingStatus (agregar NO_SHOW)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'NO_SHOW'
      AND enumtypid = 'BookingStatus'::regtype
  ) THEN
    ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. ENUMS: reemplazar NotificationType con los valores nuevos
-- (los valores viejos ya no están en el schema)
-- ----------------------------------------------------------------
DO $$ BEGIN
  -- Agregar valores nuevos si no existen
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOOKING_CONFIRMATION' AND enumtypid = 'NotificationType'::regtype) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CONFIRMATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOOKING_REMINDER' AND enumtypid = 'NotificationType'::regtype) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REMINDER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOOKING_CANCELLATION' AND enumtypid = 'NotificationType'::regtype) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_CANCELLATION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOOKING_RESCHEDULE' AND enumtypid = 'NotificationType'::regtype) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_RESCHEDULE';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. ENUMS: agregar PROCESSING a NotificationStatus
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'PROCESSING'
      AND enumtypid = 'NotificationStatus'::regtype
  ) THEN
    ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. ENUMS: crear ScheduleType si no existe
--    (puede haberse creado en full_pending_migrations.sql)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduleType') THEN
    CREATE TYPE "ScheduleType" AS ENUM ('NORMAL', 'HOLIDAY', 'VACATION', 'CUSTOM');
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 5. TABLE bookings: renombrar scheduled_at → start_time
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE "bookings" RENAME COLUMN "scheduled_at" TO "start_time";
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 6. TABLE bookings: agregar end_time (calculado desde start_time
--    + duration_minutes si existe, sino start_time + 30 min)
-- ----------------------------------------------------------------
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMP(3);

-- Rellenar end_time para filas existentes
UPDATE "bookings"
SET "end_time" = CASE
  WHEN "duration_minutes" IS NOT NULL THEN "start_time" + ("duration_minutes" * INTERVAL '1 minute')
  ELSE "start_time" + INTERVAL '30 minutes'
END
WHERE "end_time" IS NULL;

-- Ahora que está relleno, hacerlo NOT NULL
ALTER TABLE "bookings"
  ALTER COLUMN "end_time" SET NOT NULL;

-- ----------------------------------------------------------------
-- 7. TABLE bookings: eliminar duration_minutes (ya no está en schema)
-- ----------------------------------------------------------------
ALTER TABLE "bookings"
  DROP COLUMN IF EXISTS "duration_minutes";

-- ----------------------------------------------------------------
-- 8. TABLE bookings: agregar columnas nuevas del schema
-- ----------------------------------------------------------------
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "patient_id"          TEXT,
  ADD COLUMN IF NOT EXISTS "notes"               TEXT,
  ADD COLUMN IF NOT EXISTS "total_amount"         DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "deposit_amount"       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "payment_method"       TEXT,
  ADD COLUMN IF NOT EXISTS "reschedule_count"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "external_booking_id" TEXT,
  ADD COLUMN IF NOT EXISTS "api_key_id"           TEXT;

-- ----------------------------------------------------------------
-- 9. TABLE bookings: normalizar payment_status a TEXT
--    (el schema lo define como String, no como enum PaymentStatus)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'payment_status'
      AND udt_name = 'PaymentStatus'
  ) THEN
    ALTER TABLE "bookings"
      ALTER COLUMN "payment_status" TYPE TEXT USING "payment_status"::text;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 10. TABLE bookings: FK a patients (si la tabla existe)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patients')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'bookings_patient_id_fkey'
    )
  THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_patient_id_fkey"
      FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 11. TABLE bookings: FK a api_keys (si la tabla existe)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys')
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'bookings_api_key_id_fkey'
    )
  THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_api_key_id_fkey"
      FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 12. INDEX: reemplazar índices viejos de scheduled_at
-- ----------------------------------------------------------------
DROP INDEX IF EXISTS "bookings_organization_id_scheduled_at_idx";
DROP INDEX IF EXISTS "bookings_professional_id_scheduled_at_idx";

CREATE INDEX IF NOT EXISTS "bookings_professional_id_start_time_idx"
  ON "bookings"("professional_id", "start_time");

CREATE INDEX IF NOT EXISTS "bookings_patient_email_idx"
  ON "bookings"("patient_email");

-- ----------------------------------------------------------------
-- 13. TABLE notification_jobs: reestructurar al schema actual
-- ----------------------------------------------------------------

-- Eliminar columnas viejas que ya no están en el schema
ALTER TABLE "notification_jobs"
  DROP COLUMN IF EXISTS "channel",
  DROP COLUMN IF EXISTS "attempts",
  DROP COLUMN IF EXISTS "last_error";

-- Agregar columnas nuevas
ALTER TABLE "notification_jobs"
  ADD COLUMN IF NOT EXISTS "booking_id"    TEXT,
  ADD COLUMN IF NOT EXISTS "sent_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "error"         TEXT;

-- scheduled_for: en init era nullable, el schema actual lo exige NOT NULL
DO $$ BEGIN
  -- Rellenar NULLs antes de hacer NOT NULL
  UPDATE "notification_jobs" SET "scheduled_for" = now() WHERE "scheduled_for" IS NULL;
  ALTER TABLE "notification_jobs" ALTER COLUMN "scheduled_for" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- FK booking_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notification_jobs_booking_id_fkey'
  ) THEN
    ALTER TABLE "notification_jobs"
      ADD CONSTRAINT "notification_jobs_booking_id_fkey"
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 14. TABLE organizations: columnas que pueden faltar
-- ----------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "description"           TEXT,
  ADD COLUMN IF NOT EXISTS "primary_color"         TEXT,
  ADD COLUMN IF NOT EXISTS "email_enabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancel_refund_hours"   INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "cancel_partial_hours"  INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "cancel_partial_pct"    INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "max_reschedules"        INTEGER NOT NULL DEFAULT 2;

-- ----------------------------------------------------------------
-- 15. TABLE professionals: columnas actuales del schema
-- ----------------------------------------------------------------
ALTER TABLE "professionals"
  ADD COLUMN IF NOT EXISTS "bio"            TEXT,
  ADD COLUMN IF NOT EXISTS "avatar_url"     TEXT,
  ADD COLUMN IF NOT EXISTS "password_hash"  TEXT;

-- Eliminar columnas viejas no presentes en el schema actual
ALTER TABLE "professionals"
  DROP COLUMN IF EXISTS "google_calendar_token",
  DROP COLUMN IF EXISTS "google_calendar_id";

-- ----------------------------------------------------------------
-- 16. TABLE services: agregar image_url si falta
-- ----------------------------------------------------------------
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT;

-- ----------------------------------------------------------------
-- 17. Asegurar que blackout_dates tenga organization_id indexado
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "blackout_dates_organization_id_idx"
  ON "blackout_dates"("organization_id");
