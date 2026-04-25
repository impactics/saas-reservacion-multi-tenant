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

    // Validar servicio dentro de esta org (evita IDOR entre orgs)
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

    // ────────────────────────────────────────────────────────────────
    // IDOR fix: verificar que el profesional pertenece a esta organización.
    // Sin este check, un atacante podría bookear con professionalId de
    // otra org si conoce el ID.
    // ────────────────────────────────────────────────────────────────
    const professional = await prisma.professional.findFirst({
      where: {
        id: parsed.data.professionalId,
        organizationId: org.id,
        active: true,
      },
      select: { id: true },
    });
    if (!professional) {
      return NextResponse.json(
        { error: "Profesional no encontrado" },
        { status: 404 }
      );
    }

    const scheduledAt = new Date(parsed.data.scheduledAt);
    const slotEnd = new Date(
      scheduledAt.getTime() + service.durationMinutes * 60_000
    );

    // Verificar que el slot sigue disponible (doble check)
    const conflict = await prisma.booking.findFirst({
      where: {
        professionalId: professional.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledAt: {
          gte: scheduledAt,
          lt: slotEnd,
        },
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "El slot ya no está disponible" },
        { status: 409 }
      );
    }

    // ────────────────────────────────────────────────────────────────
    // C-04 fix: si el servicio tiene precio, el booking nace en PENDING
    // y sólo pasa a CONFIRMED cuando el webhook de pago lo confirma.
    // Servicios gratuitos (price = 0) se confirman directamente.
    // ────────────────────────────────────────────────────────────────
    const isFree = !service.price || Number(service.price) === 0;
    const initialStatus = isFree ? "CONFIRMED" : "PENDING";

    const booking = await prisma.booking.create({
      data: {
        organizationId: org.id,
        professionalId: professional.id,
        serviceId: service.id,
        patientName: parsed.data.patientName,
        patientEmail: parsed.data.patientEmail,
        patientPhone: parsed.data.patientPhone,
        scheduledAt,
        durationMinutes: service.durationMinutes,
        status: initialStatus,
        paymentStatus: "UNPAID",
      },
    });

    // Encolar notificaciones solo si el booking ya está confirmado (servicio gratuito)
    // Para servicios de pago, las notificaciones se encolan desde el webhook de pago
    if (isFree) {
      enqueueBookingConfirmedJobs({
        organizationId: org.id,
        bookingId: booking.id,
        scheduledAt,
        whatsappEnabled: org.whatsappEnabled,
        calendarEnabled: org.googleCalendarEnabled,
      }).catch((e) => console.error("[notifications] enqueue error", e));
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    console.error("[bookings] POST error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
