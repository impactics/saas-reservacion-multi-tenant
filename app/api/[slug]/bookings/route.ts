import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";
import { z } from "zod";

const CreateBookingSchema = z.object({
  professionalId: z.string().min(1),
  serviceId: z.string().min(1),
  patientName: z.string().min(2),
  patientEmail: z.email().optional(),
  patientPhone: z.string().min(7),
  scheduledAt: z.iso.datetime(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();

    const parsed = CreateBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
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
      return NextResponse.json(
        { error: "Servicio no encontrado" },
        { status: 404 }
      );
    }

    const scheduledAt = new Date(parsed.data.scheduledAt);

    // Verificar que el slot sigue disponible (doble check)
    const conflict = await prisma.booking.findFirst({
      where: {
        professionalId: parsed.data.professionalId,
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledAt: {
          gte: scheduledAt,
          lt: new Date(scheduledAt.getTime() + service.durationMinutes * 60000),
        },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "El slot ya no está disponible" },
        { status: 409 }
      );
    }

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
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
      },
    });

    // Encolar notificaciones de forma asíncrona (no bloquea la respuesta)
    enqueueBookingConfirmedJobs({
      organizationId: org.id,
      bookingId: booking.id,
      scheduledAt,
      whatsappEnabled: org.whatsappEnabled,
      calendarEnabled: org.googleCalendarEnabled,
    }).catch((e) => console.error("[notifications] enqueue error", e));

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    console.error("[bookings] POST error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
