-- ================================================================
-- RESET_FULL_SCHEMA.sql
-- Ejecutar COMPLETO en Neon SQL Editor cuando la DB está vacía.
-- Es idempotente: usa IF NOT EXISTS / IF EXISTS en todo.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingStatus') THEN
    CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_RESCHEDULED', 'REMINDER_24H',
      'BOOKING_CONFIRMATION', 'BOOKING_REMINDER', 'BOOKING_CANCELLATION', 'BOOKING_RESCHEDULE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'CALENDAR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduleType') THEN
    CREATE TYPE "ScheduleType" AS ENUM ('NORMAL', 'HOLIDAY', 'VACATION', 'CUSTOM');
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. TABLE: organizations
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "organizations" (
    "id"                    TEXT        NOT NULL,
    "slug"                  TEXT        NOT NULL,
    "name"                  TEXT        NOT NULL,
    "logo_url"              TEXT,
    "description"           TEXT,
    "primary_color"         TEXT,
    "phone_whatsapp"        TEXT,
    "timezone"              TEXT        NOT NULL DEFAULT 'America/Guayaquil',
    "google_calendar_enabled" BOOLEAN   NOT NULL DEFAULT false,
    "whatsapp_enabled"      BOOLEAN     NOT NULL DEFAULT false,
    "email_enabled"         BOOLEAN     NOT NULL DEFAULT false,
    "cancel_refund_hours"   INTEGER     NOT NULL DEFAULT 24,
    "cancel_partial_hours"  INTEGER     NOT NULL DEFAULT 12,
    "cancel_partial_pct"    INTEGER     NOT NULL DEFAULT 50,
    "max_reschedules"       INTEGER     NOT NULL DEFAULT 2,
    "payphone_token"        TEXT,
    "payphone_store_id"     TEXT,
    "payphone_enabled"      BOOLEAN     NOT NULL DEFAULT false,
    "wapi_token"            TEXT,
    "wapi_phone_number_id"  TEXT,
    "wapi_from_number"      TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

-- ----------------------------------------------------------------
-- 3. TABLE: professionals
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "professionals" (
    "id"              TEXT        NOT NULL,
    "organization_id" TEXT        NOT NULL,
    "name"            TEXT        NOT NULL,
    "email"           TEXT,
    "phone"           TEXT,
    "specialty"       TEXT,
    "bio"             TEXT,
    "avatar_url"      TEXT,
    "password_hash"   TEXT,
    "active"          BOOLEAN     NOT NULL DEFAULT true,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "professionals_organization_id_idx"        ON "professionals"("organization_id");
CREATE INDEX IF NOT EXISTS "professionals_organization_id_active_idx" ON "professionals"("organization_id", "active");

ALTER TABLE "professionals"
  DROP CONSTRAINT IF EXISTS "professionals_organization_id_fkey";
ALTER TABLE "professionals"
  ADD CONSTRAINT "professionals_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 4. TABLE: services
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "services" (
    "id"              TEXT           NOT NULL,
    "organization_id" TEXT           NOT NULL,
    "professional_id" TEXT           NOT NULL,
    "name"            TEXT           NOT NULL,
    "description"     TEXT,
    "duration_minutes" INTEGER       NOT NULL,
    "price"           DECIMAL(10,2)  NOT NULL,
    "currency"        TEXT           NOT NULL DEFAULT 'USD',
    "image_url"       TEXT,
    "active"          BOOLEAN        NOT NULL DEFAULT true,
    "created_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "services_organization_id_idx"        ON "services"("organization_id");
CREATE INDEX IF NOT EXISTS "services_professional_id_idx"        ON "services"("professional_id");
CREATE INDEX IF NOT EXISTS "services_organization_id_active_idx" ON "services"("organization_id", "active");

ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_organization_id_fkey";
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_professional_id_fkey";
ALTER TABLE "services" ADD CONSTRAINT "services_professional_id_fkey"
  FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 5. TABLE: patients
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "patients" (
    "id"              TEXT        NOT NULL,
    "organization_id" TEXT        NOT NULL,
    "phone"           TEXT        NOT NULL,
    "name"            TEXT,
    "email"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "patients_organization_id_idx"       ON "patients"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "patients_organization_id_phone_key" ON "patients"("organization_id", "phone");

ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_organization_id_fkey";
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 6. TABLE: api_keys
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT        NOT NULL,
    "name"            TEXT        NOT NULL,
    "key_hash"        TEXT        NOT NULL,
    "key_prefix"      TEXT        NOT NULL,
    "allowed_origins" TEXT[]      NOT NULL DEFAULT '{}',
    "active"          BOOLEAN     NOT NULL DEFAULT true,
    "last_used_at"    TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "idx_api_keys_org"    ON "api_keys"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_api_keys_hash"   ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "idx_api_keys_active" ON "api_keys"("organization_id", "active");

ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_organization_id_fkey";
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 7. TABLE: bookings
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "bookings" (
    "id"                  TEXT           NOT NULL,
    "organization_id"     TEXT           NOT NULL,
    "professional_id"     TEXT           NOT NULL,
    "service_id"          TEXT           NOT NULL,
    "patient_id"          TEXT,
    "patient_name"        TEXT           NOT NULL,
    "patient_email"       TEXT,
    "patient_phone"       TEXT           NOT NULL,
    "start_time"          TIMESTAMP(3)   NOT NULL,
    "end_time"            TIMESTAMP(3)   NOT NULL,
    "status"              "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status"      TEXT           NOT NULL DEFAULT 'UNPAID',
    "payment_id"          TEXT,
    "payment_method"      TEXT,
    "total_amount"        DECIMAL(10,2),
    "deposit_amount"      DECIMAL(10,2),
    "refund_amount"       DECIMAL(10,2),
    "access_token"        TEXT,
    "notes"               TEXT,
    "cancellation_reason" TEXT,
    "reschedule_count"    INTEGER        NOT NULL DEFAULT 0,
    "external_booking_id" TEXT,
    "api_key_id"          TEXT,
    "google_event_id"     TEXT,
    "created_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bookings_organization_id_idx"       ON "bookings"("organization_id");
CREATE INDEX IF NOT EXISTS "bookings_professional_id_idx"       ON "bookings"("professional_id");
CREATE INDEX IF NOT EXISTS "bookings_service_id_idx"            ON "bookings"("service_id");
CREATE INDEX IF NOT EXISTS "bookings_patient_id_idx"            ON "bookings"("patient_id");
CREATE INDEX IF NOT EXISTS "bookings_patient_phone_idx"         ON "bookings"("patient_phone");
CREATE INDEX IF NOT EXISTS "bookings_patient_email_idx"         ON "bookings"("patient_email");
CREATE INDEX IF NOT EXISTS "bookings_access_token_idx"          ON "bookings"("access_token");
CREATE INDEX IF NOT EXISTS "bookings_professional_id_start_time_idx" ON "bookings"("professional_id", "start_time");

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_organization_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_professional_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_professional_id_fkey"
  FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_service_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_patient_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_api_key_id_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_api_key_id_fkey"
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 8. TABLE: booking_reschedules
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "booking_reschedules" (
    "id"                    TEXT        NOT NULL,
    "organization_id"       TEXT        NOT NULL,
    "booking_id"            TEXT        NOT NULL,
    "previous_scheduled_at" TIMESTAMP(3) NOT NULL,
    "new_scheduled_at"      TIMESTAMP(3) NOT NULL,
    "reason"                TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_reschedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_reschedules_organization_id_idx" ON "booking_reschedules"("organization_id");
CREATE INDEX IF NOT EXISTS "booking_reschedules_booking_id_idx"      ON "booking_reschedules"("booking_id");

ALTER TABLE "booking_reschedules" DROP CONSTRAINT IF EXISTS "booking_reschedules_booking_id_fkey";
ALTER TABLE "booking_reschedules" ADD CONSTRAINT "booking_reschedules_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 9. TABLE: notification_jobs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notification_jobs" (
    "id"              TEXT                 NOT NULL,
    "organization_id" TEXT                 NOT NULL,
    "booking_id"      TEXT,
    "type"            "NotificationType"   NOT NULL,
    "status"          "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_for"   TIMESTAMP(3)         NOT NULL,
    "sent_at"         TIMESTAMP(3),
    "error"           TEXT,
    "created_at"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_jobs_organization_id_idx"    ON "notification_jobs"("organization_id");
CREATE INDEX IF NOT EXISTS "notification_jobs_booking_id_idx"         ON "notification_jobs"("booking_id");
CREATE INDEX IF NOT EXISTS "notification_jobs_status_scheduled_for_idx" ON "notification_jobs"("status", "scheduled_for");

ALTER TABLE "notification_jobs" DROP CONSTRAINT IF EXISTS "notification_jobs_organization_id_fkey";
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_jobs" DROP CONSTRAINT IF EXISTS "notification_jobs_booking_id_fkey";
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 10. TABLE: availability_rules
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "availability_rules" (
    "id"                    TEXT        NOT NULL,
    "organization_id"       TEXT        NOT NULL,
    "professional_id"       TEXT        NOT NULL,
    "schedule_id"           TEXT,
    "day_of_week"           INTEGER     NOT NULL,
    "start_time"            TEXT        NOT NULL,
    "end_time"              TEXT        NOT NULL,
    "slot_duration_minutes" INTEGER     NOT NULL,
    "active"                BOOLEAN     NOT NULL DEFAULT true,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "availability_rules_organization_id_idx"                    ON "availability_rules"("organization_id");
CREATE INDEX IF NOT EXISTS "availability_rules_professional_id_idx"                    ON "availability_rules"("professional_id");
CREATE INDEX IF NOT EXISTS "availability_rules_professional_id_day_of_week_active_idx" ON "availability_rules"("professional_id", "day_of_week", "active");
CREATE INDEX IF NOT EXISTS "idx_rules_schedule"                                         ON "availability_rules"("schedule_id");

ALTER TABLE "availability_rules" DROP CONSTRAINT IF EXISTS "availability_rules_professional_id_fkey";
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_professional_id_fkey"
  FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 11. TABLE: blackout_dates
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "blackout_dates" (
    "id"              TEXT        NOT NULL,
    "organization_id" TEXT        NOT NULL,
    "professional_id" TEXT        NOT NULL,
    "date"            TIMESTAMP(3) NOT NULL,
    "start_time"      TEXT,
    "end_time"        TEXT,
    "reason"          TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blackout_dates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blackout_dates_organization_id_idx"      ON "blackout_dates"("organization_id");
CREATE INDEX IF NOT EXISTS "blackout_dates_professional_id_idx"      ON "blackout_dates"("professional_id");
CREATE INDEX IF NOT EXISTS "blackout_dates_professional_id_date_idx" ON "blackout_dates"("professional_id", "date");

ALTER TABLE "blackout_dates" DROP CONSTRAINT IF EXISTS "blackout_dates_professional_id_fkey";
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_professional_id_fkey"
  FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- 12. TABLE: availability_schedules
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "availability_schedules" (
    "id"              TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT          NOT NULL,
    "professional_id" TEXT          NOT NULL,
    "name"            TEXT          NOT NULL,
    "schedule_type"   "ScheduleType" NOT NULL DEFAULT 'NORMAL',
    "is_default"      BOOLEAN       NOT NULL DEFAULT false,
    "valid_from"      DATE,
    "valid_to"        DATE,
    "active"          BOOLEAN       NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT "availability_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_schedules_professional" ON "availability_schedules"("professional_id");
CREATE INDEX IF NOT EXISTS "idx_schedules_org"          ON "availability_schedules"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_schedules_active"       ON "availability_schedules"("professional_id", "active");

ALTER TABLE "availability_schedules" DROP CONSTRAINT IF EXISTS "availability_schedules_organization_id_fkey";
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availability_schedules" DROP CONSTRAINT IF EXISTS "availability_schedules_professional_id_fkey";
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_professional_id_fkey"
  FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availability_rules" DROP CONSTRAINT IF EXISTS "availability_rules_schedule_id_fkey";
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "availability_schedules"("id") ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 13. TABLE: admins (NextAuth credentials)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "admins" (
    "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT        NOT NULL,
    "email"           TEXT        NOT NULL,
    "password_hash"   TEXT        NOT NULL,
    "name"            TEXT,
    "is_super_admin"  BOOLEAN     NOT NULL DEFAULT false,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admins_email_key" ON "admins"("email");
CREATE INDEX IF NOT EXISTS "admins_organization_id_idx" ON "admins"("organization_id");

ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "admins_organization_id_fkey";
ALTER TABLE "admins" ADD CONSTRAINT "admins_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- VERIFICACIÓN — ejecuta esto después para confirmar
-- ----------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
