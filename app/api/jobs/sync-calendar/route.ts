import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";

export const runtime = "nodejs";

interface Payload {
  notificationJobId: string;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid = await qstashReceiver.verify({ signature, body });
  if (!isValid)
    return NextResponse.json({ error: "Firma inv\u00e1lida" }, { status: 401 });

  const payload: Payload = JSON.parse(body);
  const { notificationJobId } = payload;

  const job = await prisma.notificationJob.findUnique({
    where: { id: notificationJobId },
    include: {
      booking: {
        include: { service: true, professional: true, organization: true },
      },
    },
  });

  if (!job || job.status === "SENT")
    return NextResponse.json({ skipped: true });

  if (!job.booking.organization.googleCalendarEnabled) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      // lastError no existe en el schema — campo correcto: "error"
      data: { status: "FAILED", error: "Google Calendar no habilitado" },
    });
    return NextResponse.json({ skipped: true });
  }

  const { booking } = job;
  // durationMinutes no existe en Booking — viene del Service relacionado
  const durationMinutes = booking.service.durationMinutes;

  try {
    // BOOKING_CANCELLATION es el valor correcto del enum NotificationType
    if (job.type === "BOOKING_CANCELLATION") {
      if (booking.externalBookingId) {
        await deleteCalendarEvent({
          organizationId: booking.organizationId,
          eventId:        booking.externalBookingId,
        });
        await prisma.booking.update({
          where: { id: booking.id },
          data:  { externalBookingId: null },
        });
      }
    } else {
      // Crear o actualizar evento (BOOKING_CONFIRMATION o BOOKING_RESCHEDULE)
      const eventId = await upsertCalendarEvent({
        organizationId: booking.organizationId,
        summary:        `${booking.service.name} \u2014 ${booking.patientName}`,
        description: [
          `Paciente: ${booking.patientName}`,
          `Tel\u00e9fono: ${booking.patientPhone ?? "N/A"}`,
          booking.patientEmail ? `Email: ${booking.patientEmail}` : "",
          `Servicio: ${booking.service.name}`,
          `Duraci\u00f3n: ${durationMinutes} min`,
        ]
          .filter(Boolean)
          .join("\n"),
        // scheduledAt no existe — usar startTime
        startAt:         booking.startTime,
        durationMinutes: durationMinutes,
        attendeeEmail:   booking.patientEmail ?? undefined,
        // googleEventId no existe en Booking — usar externalBookingId
        eventId:         booking.externalBookingId ?? undefined,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data:  { externalBookingId: eventId },
      });
    }

    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "SENT", sentAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // attempts no existe en el schema — solo status y error
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "FAILED", error: errorMsg },
    });
    console.error("[sync-calendar] error", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
