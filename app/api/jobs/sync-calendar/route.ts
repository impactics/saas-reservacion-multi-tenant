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
  if (!isValid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

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

  if (!job || job.status === "SENT") {
    return NextResponse.json({ skipped: true });
  }

  if (!job.booking.organization.googleCalendarEnabled) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "FAILED", lastError: "Google Calendar no habilitado" },
    });
    return NextResponse.json({ skipped: true });
  }

  const { booking } = job;

  try {
    if (job.type === "BOOKING_CANCELLED") {
      // Eliminar evento del calendario si existe
      if (booking.googleEventId) {
        await deleteCalendarEvent({
          organizationId: booking.organizationId,
          eventId: booking.googleEventId,
        });
        await prisma.booking.update({
          where: { id: booking.id },
          data: { googleEventId: null },
        });
      }
    } else {
      // Crear o actualizar evento (CONFIRMED o RESCHEDULED)
      const eventId = await upsertCalendarEvent({
        organizationId: booking.organizationId,
        summary: `${booking.service.name} — ${booking.patientName}`,
        description: [
          `Paciente: ${booking.patientName}`,
          `Teléfono: ${booking.patientPhone}`,
          booking.patientEmail ? `Email: ${booking.patientEmail}` : "",
          `Servicio: ${booking.service.name}`,
          `Duración: ${booking.durationMinutes} min`,
        ]
          .filter(Boolean)
          .join("\n"),
        startAt: booking.scheduledAt,
        durationMinutes: booking.durationMinutes,
        attendeeEmail: booking.patientEmail ?? undefined,
        eventId: booking.googleEventId ?? undefined,
      });

      // Persistir el eventId de Google Calendar en la reserva
      await prisma.booking.update({
        where: { id: booking.id },
        data: { googleEventId: eventId },
      });
    }

    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "SENT" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "FAILED", lastError: errorMessage, attempts: { increment: 1 } },
    });
    console.error("[sync-calendar] error", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
