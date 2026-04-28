import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withCors, corsOptions, getAllowedOrigins } from "@/lib/cors";

const CreateBookingSchema = z.object({
  professionalId: z.string().min(1),
  serviceId: z.string().min(1),
  patientName: z.string().min(2),
  patientEmail: z.email().optional(),
  patientPhone: z.string().min(7),
  scheduledAt: z.iso.datetime(),
});

// Preflight CORS
export function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = req.headers.get("origin");
  const origins = getAllowedOrigins();

  try {
    const { slug } = await params;
    const body = await req.json();

    const parsed = CreateBookingSchema.safeParse(body);
    if (!parsed.success) {
      return withCors(
        NextResponse.json(
          { error: "Datos inválidos", details: parsed.error.flatten() },
          { status: 400 }
        ),
        origin,
        origins
      );
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
    });
    if (!org) {
      return withCors(
        NextResponse.json({ error: "Organización no encontrada" }, { status: 404 }),
        origin,
        origins
      );
    }

    const service = await prisma.service.findFirst({
      where: {
        id: parsed.data.serviceId,
        organizationId: org.id,
        active: true,
      },
    });
    if (!service) {
      return withCors(
        NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 }),
        origin,
        origins
      );
    }

    const scheduledAt = new Date(parsed.data.scheduledAt);

    // Verificar que el slot sigue disponible (doble check)
    // Considera tanto PENDING_PAYMENT como CONFIRMED para bloquear el slot
    const conflict = await prisma.booking.findFirst({
      where: {
        professionalId: parsed.data.professionalId,
        status: { in: ["PENDING", "PENDING_PAYMENT", "CONFIRMED"] },
        scheduledAt: {
          gte: scheduledAt,
          lt: new Date(scheduledAt.getTime() + service.durationMinutes * 60000),
        },
      },
    });
    if (conflict) {
      return withCors(
        NextResponse.json({ error: "El slot ya no está disponible" }, { status: 409 }),
        origin,
        origins
      );
    }

    // Crea la reserva en estado PENDING_PAYMENT.
    // El webhook de pago la moverá a CONFIRMED y disparará las notificaciones.
    const booking = await prisma.booking.create({
      data: {
        organizationId: org.id,
        professionalId: parsed.data.professionalId,
        serviceId: service.id,
        patientName: parsed.data.patientName,
        patientEmail: parsed.data.patientEmail,
        patientPhone: parsed.data.patientPhone,
        scheduledAt,
        durationMinutes: service.durationMinutes,
        status: "PENDING_PAYMENT",
        paymentStatus: "UNPAID",
      },
    });

    return withCors(
      NextResponse.json({ booking }, { status: 201 }),
      origin,
      origins
    );
  } catch (err) {
    console.error("[bookings] POST error", err);
    return withCors(
      NextResponse.json({ error: "Error interno" }, { status: 500 }),
      origin,
      origins
    );
  }
}
