/**
 * Autenticación de pacientes via OTP por WhatsApp.
 * Flujo: POST /api/{slug}/auth/otp
 *   { action: "request", phone }  → envía OTP (válido 10 min)
 *   { action: "verify", phone, code } → devuelve patientToken (JWT, 30d)
 */
import { redis, rateLimit } from "@/lib/redis";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-prod");
const OTP_TTL    = 600;
const OTP_KEY    = (orgId: string, phone: string) => `otp:${orgId}:${phone.replace(/\D/g, "")}`;

export async function requestOtp({
  orgId,
  orgName,
  phone,
}: {
  orgId: string;
  orgName: string;
  phone: string;
}) {
  const rl = await rateLimit({
    key: `otp_req:${phone.replace(/\D/g, "")}`,
    maxRequests: 3,
    windowSeconds: OTP_TTL,
  });
  if (!rl.allowed) return { sent: false, error: "Demasiados intentos. Espera 10 minutos." };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await redis.set(OTP_KEY(orgId, phone), code, { ex: OTP_TTL });
  await sendWhatsAppText(
    phone,
    `🔐 *${orgName}* — Tu código es: *${code}*\nVálido 10 min. No lo compartas.`
  );
  return { sent: true };
}

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
}) {
  const rl = await rateLimit({
    key: `otp_verify:${phone.replace(/\D/g, "")}`,
    maxRequests: 5,
    windowSeconds: OTP_TTL,
  });
  if (!rl.allowed) return { error: "Demasiados intentos. Solicita un nuevo código." };

  const stored = await redis.get<string>(OTP_KEY(orgId, phone));
  if (!stored || stored !== code.trim()) return { error: "Código incorrecto o expirado." };

  await redis.del(OTP_KEY(orgId, phone));

  const cleanPhone = "+" + phone.replace(/\D/g, "");

  // Patient.name es String (no nullable en el schema) — usar string vacío como
  // fallback para que el paciente pueda completar su nombre después.
  const patient = await prisma.patient.upsert({
    where:  { organizationId_phone: { organizationId: orgId, phone: cleanPhone } },
    create: { organizationId: orgId, phone: cleanPhone, name: name ?? "" },
    update: { ...(name ? { name } : {}) },
  });

  const token = await new SignJWT({ patientId: patient.id, orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(JWT_SECRET);

  return { patient, token };
}

export async function verifyPatientToken(
  token: string
): Promise<{ patientId: string; orgId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { patientId: payload.patientId as string, orgId: payload.orgId as string };
  } catch {
    return null;
  }
}

export function getPatientTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)patient_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
