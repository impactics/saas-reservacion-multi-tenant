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

  if (!job.booking.patientEmail) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      // lastError no existe en el schema — el campo correcto es "error"
      data: { status: "FAILED", error: "Sin email del paciente" },
    });
    return NextResponse.json({ skipped: true });
  }

  const { booking } = job;
  const tz = booking.organization.timezone ?? "America/Guayaquil";
  // scheduledAt no existe — el campo correcto es startTime
  const localDate = toZonedTime(booking.startTime, tz);
  const dateStr = format(localDate, "dd/MM/yyyy");
  const timeStr = format(localDate, "HH:mm");

  // NotificationType v\u00e1lidos en el schema:
  // BOOKING_CONFIRMATION | BOOKING_REMINDER | BOOKING_CANCELLATION | BOOKING_RESCHEDULE
  const subjects: Record<string, string> = {
    BOOKING_CONFIRMATION: `Confirmaci\u00f3n de cita - ${booking.service.name}`,
    BOOKING_RESCHEDULE:   `Tu cita ha sido reagendada - ${booking.service.name}`,
    BOOKING_CANCELLATION: `Cita cancelada - ${booking.service.name}`,
    BOOKING_REMINDER:     `Recordatorio: tienes una cita ma\u00f1ana`,
  };

  const htmlBodies: Record<string, string> = {
    BOOKING_CONFIRMATION: `
      <h2>\u2705 Reserva confirmada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita ha sido confirmada.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udcc5 Fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udd50 Hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83c\udfe5 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udc68\u200d\u2695\ufe0f Profesional</td><td style="padding:8px">${booking.professional.name}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}/reserva/${booking.id}" style="background:#01696f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Gestionar cita</a>
    `,
    BOOKING_RESCHEDULE: `
      <h2>\ud83d\udd04 Cita reagendada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita ha sido reagendada.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udcc5 Nueva fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udd50 Nueva hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83c\udfe5 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
      </table>
    `,
    BOOKING_CANCELLATION: `
      <h2>\u274c Cita cancelada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita del <strong>${dateStr} a las ${timeStr}</strong> ha sido cancelada.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}" style="background:#01696f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Agendar nueva cita</a>
    `,
    BOOKING_REMINDER: `
      <h2>\u23f0 Recordatorio de cita</h2>
      <p>Hola <strong>${booking.patientName}</strong>, te recordamos que ma\u00f1ana tienes una cita.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udcc5 Fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udd50 Hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83c\udfe5 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">\ud83d\udc68\u200d\u2695\ufe0f Profesional</td><td style="padding:8px">${booking.professional.name}</td></tr>
      </table>
    `,
  };

  const subject = subjects[job.type];
  const html    = htmlBodies[job.type];

  if (!subject || !html) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "FAILED", error: `Tipo desconocido: ${job.type}` },
    });
    return NextResponse.json({ error: "Tipo desconocido" }, { status: 400 });
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail   = process.env.EMAIL_FROM ?? "noreply@example.com";
    if (!resendApiKey) throw new Error("RESEND_API_KEY no configurada");

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from:    `${booking.organization.name} <${fromEmail}>`,
        to:      booking.patientEmail,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API error ${res.status}: ${errText}`);
    }

    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "SENT", sentAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // attempts no existe en el schema — solo actualizamos status y error
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data:  { status: "FAILED", error: errorMsg },
    });
    console.error("[notify-email] error", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
