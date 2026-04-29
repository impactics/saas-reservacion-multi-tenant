import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendWhatsAppText,
  buildConfirmationMessage,
  buildReminderMessage,
  type BookingMessageData,
} from "@/lib/whatsapp";

/**
 * Worker endpoint llamado por Upstash QStash.
 * Procesa un NotificationJob por llamada.
 *
 * Body esperado: { jobId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = body as { jobId: string };

    if (!jobId) {
      return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
    }

    const job = await prisma.notificationJob.findUnique({
      where: { id: jobId },
      include: {
        booking: {
          include: {
            professional: true,
            service:      true,
            organization: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
    }

    // Idempotencia: si ya fue enviado, no reenviar
    if (job.status === "SENT") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Incrementar intentos
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { attempts: { increment: 1 } },
    });

    try {
      if (job.channel === "WHATSAPP") {
        const { booking } = job;
        const msgData: BookingMessageData = {
          patientName:      booking.patientName,
          patientPhone:     booking.patientPhone,
          serviceName:      booking.service.name,
          professionalName: booking.professional.name,
          scheduledAt:      booking.scheduledAt,
          durationMinutes:  booking.durationMinutes,
          organizationName: booking.organization.name,
          timezone:         booking.organization.timezone ?? "America/Guayaquil",
        };

        const message =
          job.type === "BOOKING_CONFIRMED"
            ? buildConfirmationMessage(msgData)
            : buildReminderMessage(msgData);

        // Enviar al paciente
        await sendWhatsAppText(booking.patientPhone, message);

        // Notificar también a la organización si tiene número configurado
        const orgPhone = booking.organization.phoneWhatsapp;
        if (orgPhone && job.type === "BOOKING_CONFIRMED") {
          const orgMsg =
            `📬 *Nueva reserva recibida*\n\n` +
            `👤 *Paciente:* ${booking.patientName}\n` +
            `📱 *Teléfono:* ${booking.patientPhone}\n` +
            `📋 *Servicio:* ${booking.service.name}\n` +
            `👩‍⚕️ *Profesional:* ${booking.professional.name}\n` +
            `📅 *Fecha:* ${new Date(booking.scheduledAt).toLocaleString("es-EC", {
              timeZone: booking.organization.timezone ?? "America/Guayaquil",
              dateStyle: "full",
              timeStyle: "short",
            })}\n` +
            `💵 *Precio:* $${Number(booking.service.price).toFixed(2)} USD`;
          await sendWhatsAppText(orgPhone, orgMsg);
        }

      } else if (job.channel === "CALENDAR") {
        // TODO: integrar googleapis Calendar
        console.log(`[worker] Google Calendar pendiente - job ${job.id}`);
      }

      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: "SENT" },
      });

      return NextResponse.json({ ok: true });

    } catch (sendErr) {
      const errorMsg = sendErr instanceof Error ? sendErr.message : "Error desconocido";
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: errorMsg },
      });
      throw sendErr;
    }

  } catch (err) {
    console.error("[worker/notifications] error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
