/**
 * lib/patient-auth.ts
 *
 * Autenticación ligera de pacientes via OTP por WhatsApp.
 * Flujo:
 *   1. POST /api/{slug}/auth/otp  { action: "request", phone }
 *      → genera OTP de 6 dígitos, lo guarda en Redis 10 min, envía por WhatsApp
 *   2. POST /api/{slug}/auth/otp  { action: "verify", phone, code }
 *      → valida OTP, crea o recupera Patient, devuelve { patientToken }
 *
 * El patientToken es un JWT firmado con NEXTAUTH_SECRET que se almacena
 * en una cookie httpOnly "patient_token" (30 días).
 * Cada ruta protegida del paciente llama a verifyPatientToken() para leerlo.
 */

import { redis, rateLimit } from "@/lib/redis";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-prod"
);

const OTP_TTL_SECONDS = 600; // 10 minutos
const OTP_KEY = (orgId: string, phone: string) =>
  `otp:${orgId}:${phone.replace(/\D/g, "")}`;

// ─────────────────────────────────────────────────────────────
// Generar y enviar OTP
// ─────────────────────────────────────────────────────────────

export async function requestOtp({
  orgId,
  orgName,
  phone,
}: {
  orgId: string;
  orgName: string;
  phone: string;
}): Promise<{ sent: boolean; error?: string }> {
  // Rate limit: máx 3 OTPs por teléfono cada 10 minutos
  const rl = await rateLimit({
    key: `otp_req:${phone.replace(/\D/g, "")}`,
    maxRequests: 3,
    windowSeconds: OTP_TTL_SECONDS,
  });
  if (!rl.allowed) {
    return { sent: false, error: "Demasiados intentos. Espera 10 minutos." };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  await redis.set(OTP_KEY(orgId, phone), code, { ex: OTP_TTL_SECONDS });

  const message =
    `🔐 *${orgName}* — Código de verificación\n\n` +
    `Tu código es: *${code}*\n\n` +
    `Válido por 10 minutos. No lo compartas con nadie.`;

  await sendWhatsAppText(phone, message);
  return { sent: true };
}

// ─────────────────────────────────────────────────────────────
// Verificar OTP y devolver Patient + token JWT
// ─────────────────────────────────────────────────────────────

export async function verifyOtp({
  orgId,
  phone,
  code,
  name,
}: {
  orgId: string;
  phone: string;
  code: string;
  name?: string;
}): Promise<{ patient: { id: string; phone: string; name: string | null }; token: string } | { error: string }> {
  // Rate limit: máx 5 intentos de verificación por teléfono cada 10 min
  const rl = await rateLimit({
    key: `otp_verify:${phone.replace(/\D/g, "")}`,
    maxRequests: 5,
    windowSeconds: OTP_TTL_SECONDS,
  });
  if (!rl.allowed) {
    return { error: "Demasiados intentos fallidos. Solicita un nuevo código." };
  }

  const stored = await redis.get<string>(OTP_KEY(orgId, phone));
  if (!stored || stored !== code.trim()) {
    return { error: "Código incorrecto o expirado." };
  }

  // Invalidar OTP tras uso exitoso
  await redis.del(OTP_KEY(orgId, phone));

  // Crear o recuperar paciente
  const cleanPhone = "+" + phone.replace(/\D/g, "");
  const patient = await prisma.patient.upsert({
    where: { organizationId_phone: { organizationId: orgId, phone: cleanPhone } },
    create: { organizationId: orgId, phone: cleanPhone, name: name ?? null },
    update: { ...(name ? { name } : {}) },
  });

  // Firmar JWT válido 30 días
  const token = await new SignJWT({ patientId: patient.id, orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(JWT_SECRET);

  return { patient, token };
}

// ─────────────────────────────────────────────────────────────
// Verificar token JWT del paciente (usar en rutas protegidas)
// ─────────────────────────────────────────────────────────────

export async function verifyPatientToken(
  token: string
): Promise<{ patientId: string; orgId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      patientId: payload.patientId as string,
      orgId: payload.orgId as string,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: leer token desde cookie de la request
// ─────────────────────────────────────────────────────────────

export function getPatientTokenFromCookie(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)patient_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
