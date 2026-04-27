-- Migración: Patient model + campos de política de cancelación
-- Ejecutar con: npx prisma migrate dev  (o aplicar este SQL manualmente)

-- Tabla de pacientes
CREATE TABLE IF NOT EXISTS "patients" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone"           TEXT NOT NULL,
    "name"            TEXT,
    "email"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "patients_organization_id_phone_key"
    ON "patients"("organization_id", "phone");

CREATE INDEX IF NOT EXISTS "patients_organization_id_idx"
    ON "patients"("organization_id");

ALTER TABLE "patients"
    ADD CONSTRAINT "patients_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Campos de política de cancelación en organizations
ALTER TABLE "organizations"
    ADD COLUMN IF NOT EXISTS "cancel_refund_hours"  INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS "cancel_partial_hours" INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS "cancel_partial_pct"   INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS "max_reschedules"       INTEGER NOT NULL DEFAULT 2;

-- Campos nuevos en bookings
ALTER TABLE "bookings"
    ADD COLUMN IF NOT EXISTS "patient_id"          TEXT,
    ADD COLUMN IF NOT EXISTS "refund_amount"        DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
    ADD COLUMN IF NOT EXISTS "access_token"         TEXT;

CREATE INDEX IF NOT EXISTS "bookings_patient_id_idx" ON "bookings"("patient_id");
CREATE INDEX IF NOT EXISTS "bookings_access_token_idx" ON "bookings"("access_token");

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Tabla historial de reprogramaciones
CREATE TABLE IF NOT EXISTS "booking_reschedules" (
    "id"                   TEXT NOT NULL,
    "organization_id"      TEXT NOT NULL,
    "booking_id"           TEXT NOT NULL,
    "previous_scheduled_at" TIMESTAMP(3) NOT NULL,
    "new_scheduled_at"     TIMESTAMP(3) NOT NULL,
    "reason"               TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_reschedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_reschedules_booking_id_idx"
    ON "booking_reschedules"("booking_id");

ALTER TABLE "booking_reschedules"
    ADD CONSTRAINT "booking_reschedules_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
