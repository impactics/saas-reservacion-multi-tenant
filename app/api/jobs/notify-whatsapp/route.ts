import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const runtime = "nodejs";

interface Payload {
  notificationJobId: string;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid = await qstashReceiver.verify({ signature, body });
  if (!isValid)
    return NextResponse.json({ error: "Firma inv\u00e1lida" }, { status: 401 });

  const payload: Payload = JSON.parse(body);
  const { notificationJobId } = payload;

  const job = await prisma.notificationJob.findUnique({
    where: { id: notificationJobId },
    include: {
      booking: {
        include: { service: true, professional: true, organization: true },
      },
    },
  });

  if (!job || job.status === "SENT")
    return NextResponse.json({ skipped: true });

  const { booking } = job;
  const tz = booking.organization.timezone ?? "America/Guayaquil";
  // scheduledAt no existe en Booking — el campo correcto es startTime
  const localDate = toZonedTime(booking.startTime, tz);
  const dateStr = format(localDate, "dd/MM/yyyy");
  const timeStr = format(localDate, "HH:mm");

  // NotificationType v\u00e1lidos: BOOKING_CONFIRMATION | BOOKING_REMINDER | BOOKING_CANCELLATION | BOOKING_RESCHEDULE
  const messages: Record<string, string> = {
    BOOKING_CONFIRMATION: `\u2705 *Reserva confirmada*\n\nHola ${booking.patientName}, tu cita ha sido confirmada.\n\n\ud83d\udcc5 *Fecha:* ${dateStr}\n\ud83d\udd50 *Hora:* ${timeStr}\n\ud83c\udfe5 *Servicio:* ${booking.service.name}\n\ud83d\udc68\u200d\u2695\ufe0f *Profesional:* ${booking.professional.name}\n\nPara reagendar o cancelar: ${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}/reserva/${booking.id}`,
    BOOKING_RESCHEDULE:   `\ud83d\udd04 *Cita reagendada*\n\nHola ${booking.patientName}, tu cita ha sido reagendada.\n\n\ud83d\udcc5 *Nueva fecha:* ${dateStr}\n\ud83d\udd50 *Nueva hora:* ${timeStr}\n\ud83c\udfe5 *Servicio:* ${booking.service.name}`,
    BOOKING_CANCELLATION: `\u274c *Cita cancelada*\n\nHola ${booking.patientName}, tu cita del ${dateStr} a las ${timeStr} ha sido cancelada.\n\nPuedes agendar una nueva cita en: ${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}`,
    BOOKING_REMINDER:     `\u23f0 *Recordatorio de cita*\n\nHola ${booking.patientName}, te recordamos que ma\u00f1ana tienes una cita.\n\n\ud83d\udcc5 *Fecha:* ${dateStr}\n\ud83d\udd50 *Hora:* ${timeStr}\n\ud83c\udfe5 *Servicio:* ${booking.service.name}\n\ud83d\udc68\u200d\u2695\ufe0f *Profesional:* ${booking.professional.name}`,
  };

  const message = messages[job.type];
  if (!message) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      // lastError no existe — el campo es "error"
      data: { status: "FAILED", error: `Tipo desconocido: ${job.type}` },
    });
    return NextResponse.json({ error: "Tipo desconocido" }, { status: 400 });
  }

  try {
    const { wapiToken, wapiPhoneNumberId, wapiFromNumber } = booking.organization;
    if (!wapiToken || !wapiPhoneNumberId || !wapiFromNumber)
      throw new Error("WhatsApp API no configurada en la organizaci\u00f3n");

    const rawPhone = booking.patientPhone ?? "";
    const phone    = rawPhone.replace(/[^0-9]/g, "");
    const toNumber = phone.startsWith("593") ? phone : `593${phone.replace(/^0/, "")}`;

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${wapiPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${wapiToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to:   toNumber,
          type: "text",
          text: { body: message },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
    }

    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "SENT", sentAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // attempts no existe en el schema — solo status y error
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "FAILED", error: errorMsg },
    });
    console.error("[notify-whatsapp] error", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
