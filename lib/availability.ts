import { prisma } from "./prisma";
import { addMinutes, format, parseISO, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export interface Slot {
  start: string; // ISO UTC
  end: string;   // ISO UTC
  localStart: string; // HH:mm en timezone del tenant
  localEnd: string;
}

/**
 * Calcula slots disponibles para un profesional en una fecha dada.
 * - Respeta availability_rules (horario semanal)
 * - Excluye blackout_dates (bloqueos parciales o totales)
 * - Excluye bookings ya confirmados/pendientes en ese rango
 * - Todo en la timezone de la organización
 */
export async function getAvailableSlots(
  professionalId: string,
  dateStr: string, // "YYYY-MM-DD" en timezone local del tenant
  organizationId: string
): Promise<Slot[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  if (!org) return [];

  const tz = org.timezone;

  // Fecha en zona horaria del tenant
  const localDate = toZonedTime(parseISO(dateStr), tz);
  const dayOfWeek = localDate.getDay(); // 0 = domingo

  // Reglas de disponibilidad para ese día
  const rules = await prisma.availabilityRule.findMany({
    where: {
      professionalId,
      organizationId,
      dayOfWeek,
      active: true,
    },
  });
  if (rules.length === 0) return [];

  // Bloqueos del día
  const dayStart = startOfDay(localDate);
  const dayEnd = endOfDay(localDate);
  const blackouts = await prisma.blackoutDate.findMany({
    where: {
      professionalId,
      date: {
        gte: fromZonedTime(dayStart, tz),
        lte: fromZonedTime(dayEnd, tz),
      },
    },
  });

  // Bookings existentes ese día
  const existingBookings = await prisma.booking.findMany({
    where: {
      professionalId,
      status: { in: ["PENDING", "CONFIRMED"] },
      scheduledAt: {
        gte: fromZonedTime(dayStart, tz),
        lte: fromZonedTime(dayEnd, tz),
      },
    },
    select: { scheduledAt: true, durationMinutes: true },
  });

  const slots: Slot[] = [];

  for (const rule of rules) {
    const [startH, startM] = rule.startTime.split(":").map(Number);
    const [endH, endM] = rule.endTime.split(":").map(Number);

    // Construir inicio/fin absolutos en UTC
    const ruleStart = fromZonedTime(
      new Date(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate(),
        startH,
        startM
      ),
      tz
    );
    const ruleEnd = fromZonedTime(
      new Date(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate(),
        endH,
        endM
      ),
      tz
    );

    let cursor = ruleStart;

    while (addMinutes(cursor, rule.slotDurationMinutes) <= ruleEnd) {
      const slotEnd = addMinutes(cursor, rule.slotDurationMinutes);

      // ¿Cae en un bloqueo?
      const blocked = blackouts.some((b) => {
        if (!b.startTime || !b.endTime) return true; // bloqueo total del día
        const [bStartH, bStartM] = b.startTime.split(":").map(Number);
        const [bEndH, bEndM] = b.endTime.split(":").map(Number);
        const bStart = fromZonedTime(
          new Date(
            localDate.getFullYear(),
            localDate.getMonth(),
            localDate.getDate(),
            bStartH,
            bStartM
          ),
          tz
        );
        const bEnd = fromZonedTime(
          new Date(
            localDate.getFullYear(),
            localDate.getMonth(),
            localDate.getDate(),
            bEndH,
            bEndM
          ),
          tz
        );
        return cursor < bEnd && slotEnd > bStart;
      });

      // ¿Solapa con un booking existente?
      const occupied = existingBookings.some((bk) => {
        const bkEnd = addMinutes(bk.scheduledAt, bk.durationMinutes);
        return cursor < bkEnd && slotEnd > bk.scheduledAt;
      });

      if (!blocked && !occupied) {
        const localCursor = toZonedTime(cursor, tz);
        const localSlotEnd = toZonedTime(slotEnd, tz);
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          localStart: format(localCursor, "HH:mm"),
          localEnd: format(localSlotEnd, "HH:mm"),
        });
      }

      cursor = slotEnd;
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start));
}
