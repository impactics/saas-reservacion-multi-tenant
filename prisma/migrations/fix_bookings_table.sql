-- ================================================================
-- fix_bookings_table.sql  v2
-- Limpia datos de prueba y recrea bookings con el schema correcto
-- ================================================================

-- 1. Limpiar tablas dependientes primero (datos de prueba, no importa)
TRUNCATE TABLE "notification_jobs"  RESTART IDENTITY CASCADE;
TRUNCATE TABLE "booking_reschedules" RESTART IDENTITY CASCADE;

-- 2. Eliminar constraints que dependen de bookings
ALTER TABLE "notification_jobs"   DROP CONSTRAINT IF EXISTS "notification_jobs_booking_id_fkey";
ALTER TABLE "booking_reschedules" DROP CONSTRAINT IF EXISTS "booking_reschedules_booking_id_fkey";

-- 3. Eliminar la tabla vieja con todas sus dependencias
DROP TABLE IF EXISTS "bookings" CASCADE;

-- 4. Crear la tabla con el schema correcto
CREATE TABLE "bookings" (
    "id"                  TEXT            NOT NULL,
    "organization_id"     TEXT            NOT NULL,
    "professional_id"     TEXT            NOT NULL,
    "service_id"          TEXT            NOT NULL,
    "patient_id"          TEXT,
    "status"              "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "patient_name"        TEXT            NOT NULL,
    "patient_email"       TEXT,
    "patient_phone"       TEXT,
    "start_time"          TIMESTAMP(3)    NOT NULL,
    "end_time"            TIMESTAMP(3)    NOT NULL,
    "notes"               TEXT,
    "total_amount"        DECIMAL(10,2),
    "deposit_amount"      DECIMAL(10,2),
    "payment_status"      TEXT,
    "payment_method"      TEXT,
    "reschedule_count"    INTEGER         NOT NULL DEFAULT 0,
    "external_booking_id" TEXT,
    "api_key_id"          TEXT,
    "created_at"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- 5. Índices
CREATE INDEX "bookings_organization_id_idx"    ON "bookings"("organization_id");
CREATE INDEX "bookings_professional_start_idx" ON "bookings"("professional_id", "start_time");
CREATE INDEX "bookings_patient_email_idx"      ON "bookings"("patient_email");

-- 6. Foreign keys de bookings
ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON UPDATE CASCADE;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON UPDATE CASCADE;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON UPDATE CASCADE;

-- 7. Restaurar FK de notification_jobs
ALTER TABLE "notification_jobs"
    ADD CONSTRAINT "notification_jobs_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Restaurar FK de booking_reschedules
ALTER TABLE "booking_reschedules"
    ADD CONSTRAINT "booking_reschedules_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
