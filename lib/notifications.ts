import { prisma } from "./prisma";
import type { NotificationType } from "@/app/generated/prisma/client";

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

export async function enqueueBookingConfirmedJobs({
  organizationId,
  bookingId,
  startTime,
  whatsappEnabled,
  calendarEnabled,
}: {
  organizationId:  string;
  bookingId:       string;
  startTime:       Date;
  whatsappEnabled: boolean;
  calendarEnabled: boolean;
}) {
  const jobs = [];

  if (whatsappEnabled) {
    jobs.push(enqueueNotification({ organizationId, bookingId, type: "BOOKING_CONFIRMATION" }));

    const reminder = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
    if (reminder > new Date()) {
      jobs.push(enqueueNotification({ organizationId, bookingId, type: "BOOKING_REMINDER", scheduledFor: reminder }));
    }
  }

  if (calendarEnabled) {
    jobs.push(enqueueNotification({ organizationId, bookingId, type: "BOOKING_CONFIRMATION" }));
  }

  await Promise.all(jobs);
}
