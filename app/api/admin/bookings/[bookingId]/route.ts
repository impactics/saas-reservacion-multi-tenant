/**
 * PATCH /api/admin/bookings/[bookingId]
 * Actualiza el estado de una reserva (CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED)
 * Solo accesible para admins autenticados de la misma org.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "RESCHEDULED"]).optional(),
  cancellationReason: z.string().optional(),
  paymentStatus: z.enum(["UNPAID", "PAID", "REFUNDED"]).optional(),
  scheduledAt: z.iso.datetime().optional(),
});

async function getOrgBooking(
  session: Awaited<ReturnType<typeof getServerSession>>,
  bookingId: string
) {
  if (!session?.user?.organizationId) return null;
  return prisma.booking.findFirst({
    where: { id: bookingId, organizationId: session.user.organizationId },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { bookingId } = await params;

  const booking = await getOrgBooking(session, bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      ...(body.data.status          && { status: body.data.status }),
      ...(body.data.paymentStatus   && { paymentStatus: body.data.paymentStatus }),
      ...(body.data.cancellationReason !== undefined && { cancellationReason: body.data.cancellationReason }),
      ...(body.data.scheduledAt     && { scheduledAt: new Date(body.data.scheduledAt) }),
    },
  });

  return NextResponse.json({ booking: updated });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { bookingId } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: session?.user?.organizationId ?? "" },
    include: {
      service:      { select: { name: true, price: true, durationMinutes: true } },
      professional: { select: { name: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  return NextResponse.json({ booking });
}
