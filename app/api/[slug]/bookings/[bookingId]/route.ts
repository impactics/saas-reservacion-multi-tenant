import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; bookingId: string }> }
) {
  try {
    const { slug, bookingId } = await params;

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, organizationId: org.id },
      include: {
        service: { select: { id: true, name: true, durationMinutes: true, price: true } },
        professional: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ booking });
  } catch (err) {
    console.error("[booking] GET error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
