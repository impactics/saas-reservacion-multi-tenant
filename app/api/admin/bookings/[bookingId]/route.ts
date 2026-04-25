/**
 * PATCH /api/admin/bookings/[bookingId]
 * Actualiza estado de una reserva (confirmar, cancelar, completar)
 *
 * Body: { status: BookingStatus, cancellationReason?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";
import { z } from "zod";

const Schema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]),
  cancellationReason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { bookingId } = await params;
  const body = Schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: session.user.organizationId },
    include: { organization: true },
  });
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: body.data.status,
      cancellationReason: body.data.cancellationReason ?? null,
    },
  });

  // Enqueue notificación según el estado
  if (body.data.status === "CONFIRMED" && booking.organization.whatsappEnabled) {
    await enqueueNotification({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      type: "BOOKING_CONFIRMED",
      channel: "WHATSAPP",
    });
  }
  if (body.data.status === "CANCELLED" && booking.organization.whatsappEnabled) {
    await enqueueNotification({
      organizationId: booking.organizationId,
      bookingId: booking.id,
      type: "BOOKING_CANCELLED",
      channel: "WHATSAPP",
    });
  }

  return NextResponse.json({ ok: true, booking: updated });
}
