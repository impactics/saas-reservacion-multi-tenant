import { google } from "googleapis";
import { prisma } from "./prisma";

async function getCalendarClient(organizationId: string) {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { organizationId } });
  if (!conn) throw new Error(`Sin conexión de Google Calendar para org ${organizationId}`);

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2.setCredentials({
    access_token:  conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date:   conn.expiresAt ? conn.expiresAt.getTime() : undefined,
  });

  // Auto-refresh: persiste tokens renovados
  oauth2.on("tokens", async (tokens) => {
    await prisma.googleCalendarConnection.update({
      where: { organizationId },
      data: {
        accessToken: tokens.access_token ?? conn.accessToken,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(tokens.expiry_date   ? { expiresAt: new Date(tokens.expiry_date) } : {}),
      },
    });
  });

  return { calendar: google.calendar({ version: "v3", auth: oauth2 }), conn };
}

export interface CalendarEventInput {
  organizationId:  string;
  summary:         string;
  description?:    string;
  location?:       string;
  startAt:         Date;
  durationMinutes: number;
  attendeeEmail?:  string;
  eventId?:        string; // si existe, actualiza
}

export async function upsertCalendarEvent(input: CalendarEventInput): Promise<string> {
  const { calendar, conn } = await getCalendarClient(input.organizationId);
  const calendarId = conn.calendarId ?? "primary";
  const end = new Date(input.startAt.getTime() + input.durationMinutes * 60000);

  const eventBody = {
    summary:     input.summary,
    description: input.description,
    location:    input.location,
    start:       { dateTime: input.startAt.toISOString(), timeZone: "America/Guayaquil" },
    end:         { dateTime: end.toISOString(),            timeZone: "America/Guayaquil" },
    ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 1440 }] },
  };

  if (input.eventId) {
    const res = await calendar.events.update({ calendarId, eventId: input.eventId, requestBody: eventBody });
    return res.data.id!;
  }
  const res = await calendar.events.insert({ calendarId, requestBody: eventBody });
  return res.data.id!;
}

export async function deleteCalendarEvent({ organizationId, eventId }: { organizationId: string; eventId: string }) {
  const { calendar, conn } = await getCalendarClient(organizationId);
  await calendar.events.delete({ calendarId: conn.calendarId ?? "primary", eventId });
}
