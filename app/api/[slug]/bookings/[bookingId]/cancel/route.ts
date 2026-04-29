/**
 * POST /api/{slug}/bookings/{bookingId}/cancel
 *
 * Cancela una cita. Si el pago fue realizado, calcula el reembolso según
 * la política de la organización.
 *
 * Auth: cookie patient_token (paciente) O query param ?adminKey=... (admin)
 * Body: { reason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPatientToken, getPatientTokenFromCookie } from "@/lib/patient-auth";
import { refundPayphonePayment, calcRefundAmount } from "@/lib/payphone";
import { sendWhatsAppText, buildCancellationMessage } from "@/lib/whatsapp";

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
  const adminKey  = req.nextUrl.searchParams.get("adminKey");
  const isAdmin   = adminKey === process.env.ADMIN_API_KEY;
  let   isPatient = false;
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
    if (!isPatient) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── Cargar cita ───────────────────────────────────────────────────────────────
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: org.id },
    include: {
      service: { select: { name: true, price: true, currency: true, durationMinutes: true } },
      professional: { select: { name: true } },
    },
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
  const now        = new Date();
  const msHasta    = booking.startTime.getTime() - now.getTime();
  const horasHasta = msHasta / (1000 * 60 * 60);
  const totalCents = booking.totalAmount
    ? Math.round(Number(booking.totalAmount) * 100)
    : booking.service.price
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

  // paymentMethod almacena el ID de transacción de Payphone cuando aplica
  if (booking.paymentStatus === "PAID" && booking.paymentMethod && refundCents > 0) {
    const refundResult = await refundPayphonePayment(booking.paymentMethod, refundCents);
    refundSuccess = refundResult.success;
    refundError   = refundResult.error;
  }

  // ── Actualizar cita ───────────────────────────────────────────────────────────
  const newPaymentStatus =
    booking.paymentStatus === "PAID" && refundCents > 0 ? "REFUNDED" : booking.paymentStatus;

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status:        "CANCELLED",
      notes:         body?.reason ? `Cancelación: ${body.reason}` : booking.notes,
      paymentStatus: newPaymentStatus,
    },
  });

  // ── Notificaciones WhatsApp ───────────────────────────────────────────────────
  if (org.whatsappEnabled && booking.patientPhone) {
    const data = {
      patientName:      booking.patientName,
      patientPhone:     booking.patientPhone,
      serviceName:      booking.service.name,
      professionalName: booking.professional.name,
      scheduledAt:      booking.startTime,
      durationMinutes:  booking.service.durationMinutes,
      organizationName: org.name,
      timezone:         org.timezone,
      refundPct:        pct,
      refundAmount:     refundCents / 100,
      currency:         booking.service.currency,
    };
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${slug}/mis-citas`;
    const msg = buildCancellationMessage(data).replace("{PORTAL_URL}", portalUrl);
    sendWhatsAppText(booking.patientPhone, msg).catch(console.error);
  }

  return NextResponse.json({
    success:      true,
    refundPct:    pct,
    refundAmount: refundCents / 100,
    refundStatus: refundSuccess ? "processed" : "failed",
    ...(refundError && { refundError }),
  });
}
