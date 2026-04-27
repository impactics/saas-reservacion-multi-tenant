/**
 * POST /api/{slug}/bookings/{bookingId}/cancel
 *
 * Cancela una cita. Si el pago fue realizado, calcula el reembolso según
 * la política de la organización y solicita el reembolso a Payphone.
 *
 * Auth: cookie patient_token (paciente) O query param ?adminKey=... (admin)
 * Body: { reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPatientToken, getPatientTokenFromCookie } from "@/lib/patient-auth";
import { refundPayphonePayment, calcRefundAmount } from "@/lib/payphone";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { buildCancellationMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  const { slug, bookingId } = await params;
  const body = await req.json().catch(() => ({}));

  // ── Cargar organización ───────────────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true, name: true, timezone: true,
      cancelRefundHours: true, cancelPartialHours: true,
      cancelPartialPct: true, whatsappEnabled: true,
    },
  });
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // ── Autenticación ─────────────────────────────────────────────────────────────
  const adminKey   = req.nextUrl.searchParams.get("adminKey");
  const isAdmin    = adminKey === process.env.ADMIN_API_KEY;
  let   isPatient  = false;
  let   patientId: string | undefined;

  if (!isAdmin) {
    const cookieHeader = req.headers.get("cookie");
    const token = getPatientTokenFromCookie(cookieHeader);
    if (token) {
      const payload = await verifyPatientToken(token);
      if (payload && payload.orgId === org.id) {
        isPatient = true;
        patientId = payload.patientId;
      }
    }
    if (!isPatient) {
      // También aceptar accessToken por query param (link de email)
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
    include: { service: true, professional: true },
  });
  if (!booking) return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "La cita ya fue cancelada" }, { status: 409 });
  }
  if (booking.status === "COMPLETED") {
    return NextResponse.json({ error: "No se puede cancelar una cita completada" }, { status: 409 });
  }

  // Paciente solo puede cancelar sus propias citas
  if (isPatient && patientId && booking.patientId !== patientId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // ── Calcular reembolso ────────────────────────────────────────────────────────
  const now            = new Date();
  const msHasta        = booking.scheduledAt.getTime() - now.getTime();
  const horasHasta     = msHasta / (1000 * 60 * 60);
  const totalCents     = booking.service.price
    ? Math.round(Number(booking.service.price) * 100)
    : 0;
  const { refundCents, pct } = calcRefundAmount(
    totalCents,
    horasHasta,
    org.cancelRefundHours,
    org.cancelPartialHours,
    org.cancelPartialPct,
  );

  let refundSuccess = true;
  let refundError: string | undefined;

  if (booking.paymentStatus === "PAID" && booking.paymentId && refundCents > 0) {
    const refundResult = await refundPayphonePayment(booking.paymentId, refundCents);
    refundSuccess = refundResult.success;
    refundError   = refundResult.error;
  }

  // ── Actualizar cita ───────────────────────────────────────────────────────────
  const newPaymentStatus = booking.paymentStatus === "PAID" && refundCents > 0 ? "REFUNDED" : booking.paymentStatus;
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status:             "CANCELLED",
      cancellationReason: body?.reason ?? null,
      paymentStatus:      newPaymentStatus,
      refundAmount:       refundCents > 0 ? refundCents / 100 : undefined,
    },
  });

  // ── Notificaciones ────────────────────────────────────────────────────────────
  if (org.whatsappEnabled) {
    const data = {
      patientName:      booking.patientName,
      patientPhone:     booking.patientPhone,
      serviceName:      booking.service.name,
      professionalName: booking.professional.name,
      scheduledAt:      booking.scheduledAt,
      durationMinutes:  booking.durationMinutes,
      organizationName: org.name,
      timezone:         org.timezone,
      refundPct:        pct,
      refundAmount:     refundCents / 100,
      currency:         booking.service.currency,
    };
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${slug}/mis-citas`;
    const msg = buildCancellationMessage(data).replace("{PORTAL_URL}", portalUrl);

    // Notificar al paciente
    sendWhatsAppText(booking.patientPhone, msg).catch(console.error);

    // Notificar al doctor si tiene número configurado
    if (booking.professional.phone) {
      const doctorMsg =
        `❌ *Cita cancelada*\n\n` +
        `Paciente: ${booking.patientName}\n` +
        `Servicio: ${booking.service.name}\n` +
        `Fecha: ${booking.scheduledAt.toLocaleString("es-EC", { timeZone: org.timezone })}\n` +
        (body?.reason ? `Motivo: ${body.reason}` : "");
      sendWhatsAppText(booking.professional.phone, doctorMsg).catch(console.error);
    }
  }

  return NextResponse.json({
    success:      true,
    refundPct:    pct,
    refundAmount: refundCents / 100,
    refundStatus: refundSuccess ? "processed" : "failed",
    ...(refundError && { refundError }),
  });
}
