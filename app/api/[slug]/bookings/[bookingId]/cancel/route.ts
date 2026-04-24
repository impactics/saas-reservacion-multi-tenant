import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";
import { z } from "zod";

const CancelSchema = z.object({
  reason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  try {
    const { slug, bookingId } = await params;
    const body = await req.json();
    const parsed = CancelSchema.safeParse(body);

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, whatsappEnabled: true },
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
        { error: "La reserva ya está cancelada" },
        { status: 422 }
      );
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancellationReason: parsed.success ? parsed.data.reason : undefined,
      },
    });

    if (org.whatsappEnabled) {
      enqueueNotification({
        organizationId: org.id,
        bookingId: booking.id,
        type: "BOOKING_CANCELLED",
        channel: "WHATSAPP",
      }).catch((e) => console.error("[cancel] notify error", e));
    }

    return NextResponse.json({ booking: updated });
  } catch (err) {
    console.error("[cancel] PATCH error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
