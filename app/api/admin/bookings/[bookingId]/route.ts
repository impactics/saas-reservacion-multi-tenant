/**
 * PATCH /api/admin/bookings/[bookingId]
 * Actualiza el estado de una reserva.
 * Solo accesible para admins autenticados de la misma org.
 *
 * BookingStatus v\u00e1lidos en el schema:
 *   PENDING | CONFIRMED | CANCELLED | COMPLETED | NO_SHOW
 *
 * Nota: RESCHEDULED no existe en el enum del schema.
 * Para reagendar, actualiza status=CONFIRMED + startTime + endTime e
 * incrementa rescheduleCount.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import type { Session } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  // RESCHEDULED no existe en BookingStatus del schema — eliminado
  status: z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
    .optional(),
  // cancellationReason no es campo del modelo Booking — se guarda en notes
  notes: z.string().optional(),
  // paymentStatus es String? (no enum), acepta cualquier string
  paymentStatus: z.string().optional(),
  // Reagendar: nuevos startTime y endTime
  startTime: z.iso.datetime().optional(),
  endTime:   z.iso.datetime().optional(),
});

async function getOrgBooking(session: Session | null, bookingId: string) {
  if (!session?.user?.organizationId) return null;
  return prisma.booking.findFirst({
    where: { id: bookingId, organizationId: session.user.organizationId },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession();
  const { bookingId } = await params;

  const booking = await getOrgBooking(session, bookingId);
  if (!booking)
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success)
    return NextResponse.json(
      { error: "Datos inv\u00e1lidos", issues: body.error.issues },
      { status: 400 }
    );

  const { status, paymentStatus, notes, startTime, endTime } = body.data;

  // Si se reagenda, incrementar rescheduleCount
  const isReschedule = Boolean(startTime || endTime);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      ...(status        && { status }),
      ...(paymentStatus && { paymentStatus }),
      ...(notes !== undefined && { notes }),
      ...(startTime    && { startTime: new Date(startTime) }),
      ...(endTime      && { endTime:   new Date(endTime) }),
      ...(isReschedule && { rescheduleCount: { increment: 1 } }),
    },
  });

  return NextResponse.json({ booking: updated });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const session = await getSession();
  const { bookingId } = await params;

  const booking = await prisma.booking.findFirst({
    where: {
      id:             bookingId,
      organizationId: session?.user?.organizationId ?? "",
    },
    include: {
      service:      { select: { name: true, price: true, durationMinutes: true } },
      professional: { select: { name: true } },
    },
  });

  if (!booking)
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  return NextResponse.json({ booking });
}
