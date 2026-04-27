/**
 * POST /api/{slug}/bookings/{bookingId}/reschedule
 *
 * Reprograma una cita a una nueva fecha/hora.
 * Verifica disponibilidad del slot, registra historial, notifica por WhatsApp.
 *
 * Auth: cookie patient_token (paciente) O query param ?adminKey=... (admin)
 * Body: { scheduledAt: string (ISO), reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPatientToken, getPatientTokenFromCookie } from "@/lib/patient-auth";
import { sendWhatsAppText, buildRescheduleMessage } from "@/lib/whatsapp";
import { z } from "zod";

const RescheduleSchema = z.object({
  scheduledAt: z.iso.datetime(),
  reason:      z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  const { slug, bookingId } = await params;
  const body = await req.json().catch(() => ({}));

  const parsed = RescheduleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, whatsappEnabled: true, maxReschedules: true },
  });
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // ── Autenticación ─────────────────────────────────────────────────────────────
  const adminKey  = req.nextUrl.searchParams.get("adminKey");
  const isAdmin   = adminKey === process.env.ADMIN_API_KEY;
  let   isPatient = false;
  let   patientId: string | undefined;

  if (!isAdmin) {
    const cookieHeader  = req.headers.get("cookie");
    const token = getPatientTokenFromCookie(cookieHeader);
    if (token) {
      const payload = await verifyPatientToken(token);
      if (payload && payload.orgId === org.id) { isPatient = true; patientId = payload.patientId; }
    }
    if (!isPatient) {
      const accessToken = req.nextUrl.searchParams.get("token");
      if (accessToken) {
        const bk = await prisma.booking.findFirst({
          where: { id: bookingId, accessToken, organizationId: org.id },
          select: { id: true, patientId: true },
        });
        if (bk) { isPatient = true; patientId = bk.patientId ?? undefined; }
      }
    }
    if (!isPatient) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── Cargar cita ───────────────────────────────────────────────────────────────
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: org.id },
    include: {
      service:      true,
      professional: true,
      reschedules:  { select: { id: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
    return NextResponse.json({ error: `No se puede reprogramar una cita ${booking.status.toLowerCase()}` }, { status: 409 });
  }

  if (isPatient && patientId && booking.patientId !== patientId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Verificar límite de reprogramaciones
  if (booking.reschedules.length >= org.maxReschedules) {
    return NextResponse.json(
      { error: `Has alcanzado el límite de ${org.maxReschedules} reprogramación(es)` },
      { status: 422 }
    );
  }

  const newScheduledAt = new Date(parsed.data.scheduledAt);

  // Verificar disponibilidad del nuevo slot
  const conflict = await prisma.booking.findFirst({
    where: {
      id:             { not: bookingId },
      professionalId: booking.professionalId,
      status:         { in: ["PENDING", "CONFIRMED"] },
      scheduledAt: {
        gte: newScheduledAt,
        lt:  new Date(newScheduledAt.getTime() + booking.durationMinutes * 60000),
      },
    },
  });
  if (conflict) return NextResponse.json({ error: "El slot ya no está disponible" }, { status: 409 });

  // ── Actualizar en transacción ─────────────────────────────────────────────────
  const prevScheduledAt = booking.scheduledAt;
  await prisma.$transaction([
    prisma.bookingReschedule.create({
      data: {
        organizationId:      org.id,
        bookingId,
        previousScheduledAt: prevScheduledAt,
        newScheduledAt,
        reason:              parsed.data.reason ?? null,
      },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data:  { scheduledAt: newScheduledAt, status: "RESCHEDULED" },
    }),
  ]);

  // ── Notificaciones ────────────────────────────────────────────────────────────
  if (org.whatsappEnabled) {
    const data = {
      patientName:      booking.patientName,
      patientPhone:     booking.patientPhone,
      serviceName:      booking.service.name,
      professionalName: booking.professional.name,
      scheduledAt:      prevScheduledAt,
      durationMinutes:  booking.durationMinutes,
      organizationName: org.name,
      timezone:         org.timezone,
      newScheduledAt,
    };
    const msg = buildRescheduleMessage(data);
    sendWhatsAppText(booking.patientPhone, msg).catch(console.error);
    if (booking.professional.phone) {
      sendWhatsAppText(booking.professional.phone, msg).catch(console.error);
    }
  }

  return NextResponse.json({ success: true, scheduledAt: newScheduledAt });
}
