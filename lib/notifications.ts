import { prisma } from "./prisma";
import type { NotificationType } from "@/app/generated/prisma/client";

/**
 * Encola un NotificationJob en BD.
 * El worker de Upstash QStash lo procesa de forma as\u00edncrona.
 *
 * Nota: el schema NO tiene un campo "channel" en NotificationJob.
 * El tipo de canal se infiere del NotificationType en el worker.
 */
export async function enqueueNotification({
  organizationId,
  bookingId,
  type,
  scheduledFor,
}: {
  organizationId: string;
  bookingId:      string;
  type:           NotificationType;
  scheduledFor?:  Date;
}) {
  return prisma.notificationJob.create({
    data: {
      organizationId,
      bookingId,
      type,
      status:       "PENDING",
      scheduledFor: scheduledFor ?? new Date(),
    },
  });
}

/**
 * Encola todas las notificaciones est\u00e1ndar para una reserva nueva:
 * - Confirmaci\u00f3n WhatsApp (inmediato)
 * - Evento Google Calendar (inmediato)
 * - Recordatorio 24h antes
 */
export async function enqueueBookingConfirmedJobs({
  organizationId,
  bookingId,
  startTime,
  whatsappEnabled,
  calendarEnabled,
}: {
  organizationId:  string;
  bookingId:       string;
  startTime:       Date;   // scheduledAt no existe — campo correcto: startTime
  whatsappEnabled: boolean;
  calendarEnabled: boolean;
}) {
  const jobs = [];

  if (whatsappEnabled) {
    // BOOKING_CONFIRMED no existe — valor correcto: BOOKING_CONFIRMATION
    jobs.push(
      enqueueNotification({
        organizationId,
        bookingId,
        type: "BOOKING_CONFIRMATION",
      })
    );

    // Recordatorio 24h antes
    const reminder = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
    if (reminder > new Date()) {
      // REMINDER_24H no existe — valor correcto: BOOKING_REMINDER
      jobs.push(
        enqueueNotification({
          organizationId,
          bookingId,
          type:         "BOOKING_REMINDER",
          scheduledFor: reminder,
        })
      );
    }
  }

  if (calendarEnabled) {
    jobs.push(
      enqueueNotification({
        organizationId,
        bookingId,
        type: "BOOKING_CONFIRMATION",
      })
    );
  }

  await Promise.all(jobs);
}
