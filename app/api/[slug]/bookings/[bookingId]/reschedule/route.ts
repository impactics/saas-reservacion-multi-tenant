import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";
import { z } from "zod";

const RescheduleSchema = z.object({
  scheduledAt: z.iso.datetime(),
  reason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  try {
    const { slug, bookingId } = await params;
    const body = await req.json();

    const parsed = RescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, whatsappEnabled: true, googleCalendarEnabled: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, organizationId: org.id },
    });
    if (!booking) {
      return NextResponse.json(
        { error: "Reserva no encontrada" },
        { status: 404 }
      );
    }
    if (booking.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede reagendar una reserva cancelada" },
        { status: 422 }
      );
    }

    const newScheduledAt = new Date(parsed.data.scheduledAt);

    // Registrar historial de reagendamiento + actualizar booking en transacción
    const [, updated] = await prisma.$transaction([
      prisma.bookingReschedule.create({
        data: {
          organizationId: org.id,
          bookingId: booking.id,
          previousScheduledAt: booking.scheduledAt,
          newScheduledAt,
          reason: parsed.data.reason,
        },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          scheduledAt: newScheduledAt,
          status: "RESCHEDULED",
        },
      }),
    ]);

    // Notificaciones de reagendamiento
    const jobs = [];
    if (org.whatsappEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId: booking.id,
          type: "BOOKING_RESCHEDULED",
          channel: "WHATSAPP",
        })
      );
    }
    if (org.googleCalendarEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId: booking.id,
          type: "BOOKING_RESCHEDULED",
          channel: "CALENDAR",
        })
      );
    }
    Promise.all(jobs).catch((e) =>
      console.error("[reschedule] notify error", e)
    );

    return NextResponse.json({ booking: updated });
  } catch (err) {
    console.error("[reschedule] PATCH error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
