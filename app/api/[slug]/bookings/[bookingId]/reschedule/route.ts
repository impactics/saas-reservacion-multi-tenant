import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";
import { z } from "zod";

const RescheduleSchema = z.object({
  scheduledAt: z.iso.datetime(),
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

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, organizationId: org.id },
    });
    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (booking.status === "CANCELLED") {
      return NextResponse.json({ error: "No se puede reagendar una reserva cancelada" }, { status: 400 });
    }

    const newScheduledAt = new Date(parsed.data.scheduledAt);

    // Verificar disponibilidad en el nuevo slot
    const conflict = await prisma.booking.findFirst({
      where: {
        professionalId: booking.professionalId,
        id: { not: bookingId },
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledAt: {
          gte: newScheduledAt,
          lt: new Date(newScheduledAt.getTime() + booking.durationMinutes * 60000),
        },
      },
    });
    if (conflict) {
      return NextResponse.json({ error: "El slot ya no está disponible" }, { status: 409 });
    }

    // Guardar historial de reagendamiento
    await prisma.bookingReschedule.create({
      data: {
        bookingId: booking.id,
        previousScheduledAt: booking.scheduledAt,
        newScheduledAt,
        reason: body.reason ?? null,
      },
    });

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { scheduledAt: newScheduledAt, status: "CONFIRMED" },
    });

    // Encolar notificaciones de reagendamiento
    const jobs: Promise<unknown>[] = [];

    if (org.whatsappEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId,
          type: "BOOKING_RESCHEDULED",
          channel: "WHATSAPP",
        })
      );
    }

    if (org.googleCalendarEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId,
          type: "BOOKING_RESCHEDULED",
          channel: "CALENDAR",
        })
      );
    }

    Promise.all(jobs).catch((e) => console.error("[reschedule] enqueue error", e));

    return NextResponse.json({ booking: updated });
  } catch (err) {
    console.error("[reschedule] PATCH error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
