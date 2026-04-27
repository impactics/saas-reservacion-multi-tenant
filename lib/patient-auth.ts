/**
 * lib/patient-auth.ts
 *
 * Autenticación ligera para pacientes mediante OTP por WhatsApp.
 *
 * Flujo:
 *   1. POST /api/[slug]/auth/request-otp  → requestOTP()
 *      - Busca o crea el Patient en la BD
 *      - Genera un código de 6 dígitos
 *      - Guarda el código en PatientOTP con expiresAt = now + 10 min
 *      - Envía el código por WhatsApp al paciente
 *
 *   2. POST /api/[slug]/auth/verify-otp   → verifyOTP()
 *      - Valida el código contra PatientOTP
 *      - Marca el OTP como usado
 *      - Devuelve un JWT firmado con patientId + organizationId
 *
 *   3. El JWT viaja en cookie HttpOnly "patient_token"
 *      - verifyPatientToken() lo valida en cada request protegido
 *
 * Variables de entorno:
 *   PATIENT_JWT_SECRET  - secreto para firmar el JWT del paciente
 */

import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.PATIENT_JWT_SECRET ?? "CHANGE_ME_patient_secret_32chars"
);
const JWT_EXPIRES = "30d"; // el paciente permanece logueado 30 días
const OTP_TTL_MIN = 10;    // el OTP expira en 10 minutos

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

export interface PatientTokenPayload {
  patientId:      string;
  organizationId: string;
  phone:          string;
}

export interface RequestOTPResult {
  success: boolean;
  created: boolean;  // true si el paciente era nuevo
  patientId: string;
}

export interface VerifyOTPResult {
  success: boolean;
  token?: string;    // JWT si la verificación fue correcta
  patientId?: string;
  error?: "invalid" | "expired" | "already_used";
}

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/** Genera un código numérico de 6 dígitos como string */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Normaliza teléfono a E.164 sin símbolos: "+593 99..." → "593999..." */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

// ─────────────────────────────────────────────
// REQUEST OTP
// Crea o reutiliza el Patient y envía el código por WhatsApp
// ─────────────────────────────────────────────

export async function requestOTP({
  organizationId,
  phone,
  name,
  email,
  organizationName,
}: {
  organizationId: string;
  phone: string;
  name: string;
  email?: string;
  organizationName: string;
}): Promise<RequestOTPResult> {
  const normalizedPhone = normalizePhone(phone);

  // Busca o crea el paciente
  let created = false;
  let patient = await prisma.patient.findUnique({
    where: { organizationId_phone: { organizationId, phone: normalizedPhone } },
  });

  if (!patient) {
    patient = await prisma.patient.create({
      data: { organizationId, phone: normalizedPhone, name, email },
    });
    created = true;
  } else if (name && patient.name !== name) {
    // Actualiza el nombre si cambió
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { name, ...(email ? { email } : {}) },
    });
  }

  // Genera código y guarda en DB
  const code      = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

  await prisma.patientOTP.create({
    data: { patientId: patient.id, code, expiresAt },
  });

  // Envía por WhatsApp
  const msg =
    `🔐 *Código de verificación*\n\n` +
    `Hola ${name}, tu código para acceder a tus citas en *${organizationName}* es:\n\n` +
    `*${code}*\n\n` +
    `Expira en ${OTP_TTL_MIN} minutos. Si no lo solicitaste, ignóralo.`;

  // Usamos el teléfono original con "+" para el API de Meta
  await sendWhatsAppText("+" + normalizedPhone, msg);

  return { success: true, created, patientId: patient.id };
}

// ─────────────────────────────────────────────
// VERIFY OTP
// Valida el código y devuelve un JWT firmado
// ─────────────────────────────────────────────

export async function verifyOTP({
  organizationId,
  phone,
  code,
}: {
  organizationId: string;
  phone: string;
  code: string;
}): Promise<VerifyOTPResult> {
  const normalizedPhone = normalizePhone(phone);

  const patient = await prisma.patient.findUnique({
    where: { organizationId_phone: { organizationId, phone: normalizedPhone } },
  });

  if (!patient) return { success: false, error: "invalid" };

  // Busca el OTP más reciente no usado para este paciente
  const otp = await prisma.patientOTP.findFirst({
    where: { patientId: patient.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp)                        return { success: false, error: "invalid" };
  if (otp.code !== code)           return { success: false, error: "invalid" };
  if (otp.expiresAt < new Date())  return { success: false, error: "expired" };

  // Marca como usado
  await prisma.patientOTP.update({
    where: { id: otp.id },
    data:  { usedAt: new Date() },
  });

  // Genera JWT
  const token = await createPatientToken({
    patientId:      patient.id,
    organizationId: patient.organizationId,
    phone:          patient.phone,
  });

  return { success: true, token, patientId: patient.id };
}

// ─────────────────────────────────────────────
// JWT HELPERS
// ─────────────────────────────────────────────

export async function createPatientToken(
  payload: PatientTokenPayload
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES)
    .sign(JWT_SECRET);
}

export async function verifyPatientToken(
  token: string
): Promise<PatientTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as PatientTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extrae y verifica el token del paciente desde los headers de la request.
 * Busca en la cookie "patient_token" primero, luego en Authorization Bearer.
 */
export async function getPatientFromRequest(
  request: Request
): Promise<PatientTokenPayload | null> {
  // 1. Cookie HttpOnly
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)patient_token=([^;]+)/);
  if (match?.[1]) {
    return verifyPatientToken(decodeURIComponent(match[1]));
  }

  // 2. Authorization: Bearer <token>
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return verifyPatientToken(auth.slice(7));
  }

  return null;
}
