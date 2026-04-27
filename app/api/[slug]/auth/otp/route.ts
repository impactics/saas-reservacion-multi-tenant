/**
 * POST /api/{slug}/auth/otp
 * Body: { action: "request", phone, name? } | { action: "verify", phone, code, name? }
 *
 * Respuesta "request":  { sent: true }
 * Respuesta "verify":   { token, patient: { id, phone, name } }
 *                       + Set-Cookie: patient_token=<jwt>; HttpOnly; Path=/; Max-Age=2592000
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestOtp, verifyOtp } from "@/lib/patient-auth";
import { z } from "zod";

const RequestSchema = z.object({
  action: z.literal("request"),
  phone: z.string().min(7),
  name:  z.string().optional(),
});

const VerifySchema = z.object({
  action: z.literal("verify"),
  phone:  z.string().min(7),
  code:   z.string().length(6),
  name:   z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, whatsappEnabled: true },
  });
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  const body = await req.json();

  // ── REQUEST OTP ──────────────────────────────────────────────────────────────
  if (body?.action === "request") {
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const result = await requestOtp({
      orgId:   org.id,
      orgName: org.name,
      phone:   parsed.data.phone,
    });
    if (!result.sent) return NextResponse.json({ error: result.error }, { status: 429 });
    return NextResponse.json({ sent: true });
  }

  // ── VERIFY OTP ───────────────────────────────────────────────────────────────
  if (body?.action === "verify") {
    const parsed = VerifySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    const result = await verifyOtp({
      orgId: org.id,
      phone: parsed.data.phone,
      code:  parsed.data.code,
      name:  parsed.data.name,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });

    const res = NextResponse.json({ patient: result.patient, token: result.token });
    res.cookies.set("patient_token", result.token, {
      httpOnly: true,
      path:     "/",
      maxAge:   60 * 60 * 24 * 30, // 30 días
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
    });
    return res;
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
