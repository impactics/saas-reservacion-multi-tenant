-- Migración: credenciales de pago y WhatsApp por organización
-- Ejecutar en Neon / Supabase SQL Editor

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payphone_token       TEXT,
  ADD COLUMN IF NOT EXISTS payphone_store_id    TEXT,
  ADD COLUMN IF NOT EXISTS payphone_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wapi_token           TEXT,
  ADD COLUMN IF NOT EXISTS wapi_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS wapi_from_number     TEXT;
