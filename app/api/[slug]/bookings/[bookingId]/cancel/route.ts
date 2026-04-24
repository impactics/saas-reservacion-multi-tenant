import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  try {
    const { slug, bookingId } = await params;
    const body = await req.json().catch(() => ({}));

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
      return NextResponse.json({ error: "La reserva ya está cancelada" }, { status: 400 });
    }

    const cancelled = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: body.reason ?? null,
      },
    });

    // Encolar notificaciones de cancelación
    const jobs: Promise<unknown>[] = [];

    if (org.whatsappEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId,
          type: "BOOKING_CANCELLED",
          channel: "WHATSAPP",
        })
      );
    }

    if (org.googleCalendarEnabled) {
      jobs.push(
        enqueueNotification({
          organizationId: org.id,
          bookingId,
          type: "BOOKING_CANCELLED",
          channel: "CALENDAR",
        })
      );
    }

    Promise.all(jobs).catch((e) => console.error("[cancel] enqueue error", e));

    return NextResponse.json({ booking: cancelled });
  } catch (err) {
    console.error("[cancel] POST error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
