import { prisma } from "./prisma";
import type { NotificationChannel, NotificationType } from "./generated/prisma";

/**
 * Encola un NotificationJob en BD.
 * El worker de Upstash QStash lo procesa de forma asíncrona.
 */
export async function enqueueNotification({
  organizationId,
  bookingId,
  type,
  channel,
  scheduledFor,
}: {
  organizationId: string;
  bookingId: string;
  type: NotificationType;
  channel: NotificationChannel;
  scheduledFor?: Date;
}) {
  return prisma.notificationJob.create({
    data: {
      organizationId,
      bookingId,
      type,
      channel,
      status: "PENDING",
      scheduledFor: scheduledFor ?? null,
    },
  });
}

/**
 * Enqueue todas las notificaciones estándar para una reserva nueva:
 * - WhatsApp de confirmación (inmediato)
 * - Google Calendar event (inmediato)
 * - Recordatorio WhatsApp 24h antes
 */
export async function enqueueBookingConfirmedJobs({
  organizationId,
  bookingId,
  scheduledAt,
  whatsappEnabled,
  calendarEnabled,
}: {
  organizationId: string;
  bookingId: string;
  scheduledAt: Date;
  whatsappEnabled: boolean;
  calendarEnabled: boolean;
}) {
  const jobs = [];

  if (whatsappEnabled) {
    jobs.push(
      enqueueNotification({
        organizationId,
        bookingId,
        type: "BOOKING_CONFIRMED",
        channel: "WHATSAPP",
      })
    );

    // Recordatorio 24h antes
    const reminder = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
    if (reminder > new Date()) {
      jobs.push(
        enqueueNotification({
          organizationId,
          bookingId,
          type: "REMINDER_24H",
          channel: "WHATSAPP",
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
        type: "BOOKING_CONFIRMED",
        channel: "CALENDAR",
      })
    );
  }

  await Promise.all(jobs);
}
