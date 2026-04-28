-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "access_token" TEXT,
ADD COLUMN     "patient_id" TEXT,
ADD COLUMN     "refund_amount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "cancel_partial_hours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "cancel_partial_pct" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "cancel_refund_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "max_reschedules" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patients_organization_id_idx" ON "patients"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_phone_key" ON "patients"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "bookings_patient_id_idx" ON "bookings"("patient_id");

-- CreateIndex
CREATE INDEX "bookings_access_token_idx" ON "bookings"("access_token");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
