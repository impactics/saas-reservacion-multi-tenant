import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendWhatsAppText,
  buildConfirmationMessage,
  buildReminderMessage,
  type BookingMessageData,
} from "@/lib/whatsapp";
import { differenceInMinutes } from "date-fns";

/**
 * Worker endpoint llamado por Upstash QStash.
 * Procesa un NotificationJob por llamada.
 * Body esperado: { jobId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = body as { jobId: string };

    if (!jobId)
      return NextResponse.json({ error: "jobId requerido" }, { status: 400 });

    const job = await prisma.notificationJob.findUnique({
      where: { id: jobId },
      include: {
        booking: {
          include: {
            professional: { select: { name: true } },
            service:      { select: { name: true, price: true, durationMinutes: true } },
            organization: { select: { name: true, timezone: true, phoneWhatsapp: true } },
          },
        },
      },
    });

    if (!job)
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

    // Idempotencia
    if (job.status === "SENT")
      return NextResponse.json({ ok: true, skipped: true });

    // Marcar como procesando
    await prisma.notificationJob.update({
      where: { id: job.id },
      data:  { status: "PROCESSING" },
    });

    try {
      // NotificationJob no tiene campo "channel" en el schema
      // Usamos el tipo de notificaci\u00f3n para determinar qu\u00e9 hacer
      const isWhatsAppType =
        job.type === "BOOKING_CONFIRMATION" ||
        job.type === "BOOKING_REMINDER"    ||
        job.type === "BOOKING_CANCELLATION" ||
        job.type === "BOOKING_RESCHEDULE";

      if (isWhatsAppType) {
        const { booking } = job;
        const durationMinutes = differenceInMinutes(booking.endTime, booking.startTime);

        const msgData: BookingMessageData = {
          patientName:      booking.patientName,
          patientPhone:     booking.patientPhone ?? "",
          serviceName:      booking.service.name,
          professionalName: booking.professional.name,
          // durationMinutes viene del service, no del booking
          durationMinutes:  booking.service.durationMinutes ?? durationMinutes,
          organizationName: booking.organization.name,
          timezone:         booking.organization.timezone ?? "America/Guayaquil",
          // startTime es el campo correcto (no scheduledAt)
          scheduledAt:      booking.startTime,
        };

        const message =
          job.type === "BOOKING_CONFIRMATION"
            ? buildConfirmationMessage(msgData)
            : buildReminderMessage(msgData);

        if (booking.patientPhone) {
          await sendWhatsAppText(booking.patientPhone, message);
        }

        // Notificar a la organizaci\u00f3n en confirmaci\u00f3n
        const orgPhone = booking.organization.phoneWhatsapp;
        if (orgPhone && job.type === "BOOKING_CONFIRMATION") {
          const orgMsg =
            `\ud83d\udcec *Nueva reserva recibida*\n\n` +
            `\ud83d\udc64 *Paciente:* ${booking.patientName}\n` +
            `\ud83d\udcf1 *Tel\u00e9fono:* ${booking.patientPhone ?? "N/A"}\n` +
            `\ud83d\udccb *Servicio:* ${booking.service.name}\n` +
            `\ud83d\udc69\u200d\u2695\ufe0f *Profesional:* ${booking.professional.name}\n` +
            `\ud83d\udcc5 *Fecha:* ${booking.startTime.toLocaleString("es-EC", {
              timeZone:  booking.organization.timezone ?? "America/Guayaquil",
              dateStyle: "full",
              timeStyle: "short",
            })}\n` +
            `\ud83d\udcb5 *Precio:* $${Number(booking.service.price).toFixed(2)} USD`;
          await sendWhatsAppText(orgPhone, orgMsg);
        }
      } else if (job.type === "BOOKING_RESCHEDULE") {
        // TODO: integrar Google Calendar si aplica
        console.log(`[worker] BOOKING_RESCHEDULE calendar pendiente - job ${job.id}`);
      }

      await prisma.notificationJob.update({
        where: { id: job.id },
        data:  { status: "SENT", sentAt: new Date() },
      });

      return NextResponse.json({ ok: true });

    } catch (sendErr) {
      const errorMsg = sendErr instanceof Error ? sendErr.message : "Error desconocido";
      await prisma.notificationJob.update({
        where: { id: job.id },
        data:  { status: "FAILED", error: errorMsg },
      });
      throw sendErr;
    }

  } catch (err) {
    console.error("[worker/notifications] error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
