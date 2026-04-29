import { prisma } from "./prisma";
import { addMinutes, format, parseISO, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export interface Slot {
  start:      string; // ISO UTC
  end:        string; // ISO UTC
  localStart: string; // HH:mm en timezone del tenant
  localEnd:   string;
}

export async function getAvailableSlots(
  professionalId: string,
  dateStr: string,       // "YYYY-MM-DD" en timezone local del tenant
  organizationId: string
): Promise<Slot[]> {
  const org = await prisma.organization.findUnique({
    where:  { id: organizationId },
    select: { timezone: true },
  });
  if (!org) return [];

  const tz        = org.timezone;
  const localDate = toZonedTime(parseISO(dateStr), tz);
  const dayOfWeek = localDate.getDay();

  const rules = await prisma.availabilityRule.findMany({
    where: { professionalId, organizationId, dayOfWeek, active: true },
  });
  if (rules.length === 0) return [];

  const dayStart = startOfDay(localDate);
  const dayEnd   = endOfDay(localDate);

  const blackouts = await prisma.blackoutDate.findMany({
    where: {
      professionalId,
      date: { gte: fromZonedTime(dayStart, tz), lte: fromZonedTime(dayEnd, tz) },
    },
  });

  // Booking no tiene durationMinutes — usamos startTime + endTime
  const existingBookings = await prisma.booking.findMany({
    where: {
      professionalId,
      status:    { in: ["PENDING", "CONFIRMED"] },
      startTime: { gte: fromZonedTime(dayStart, tz), lte: fromZonedTime(dayEnd, tz) },
    },
    select: { startTime: true, endTime: true },
  });

  const slots: Slot[] = [];

  for (const rule of rules) {
    const [startH, startM] = rule.startTime.split(":").map(Number);
    const [endH,   endM]   = rule.endTime.split(":").map(Number);

    const ruleStart = fromZonedTime(new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), startH, startM), tz);
    const ruleEnd   = fromZonedTime(new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), endH,   endM),   tz);

    let cursor = ruleStart;

    while (addMinutes(cursor, rule.slotDurationMinutes) <= ruleEnd) {
      const slotEnd = addMinutes(cursor, rule.slotDurationMinutes);

      const blocked = blackouts.some((b) => {
        if (!b.startTime || !b.endTime) return true;
        const [bStartH, bStartM] = b.startTime.split(":").map(Number);
        const [bEndH,   bEndM]   = b.endTime.split(":").map(Number);
        const bStart = fromZonedTime(new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), bStartH, bStartM), tz);
        const bEnd   = fromZonedTime(new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), bEndH,   bEndM),   tz);
        return cursor < bEnd && slotEnd > bStart;
      });

      const occupied = existingBookings.some((bk) => cursor < bk.endTime && slotEnd > bk.startTime);

      if (!blocked && !occupied) {
        slots.push({
          start:      cursor.toISOString(),
          end:        slotEnd.toISOString(),
          localStart: format(toZonedTime(cursor,  tz), "HH:mm"),
          localEnd:   format(toZonedTime(slotEnd, tz), "HH:mm"),
        });
      }

      cursor = slotEnd;
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start));
}
