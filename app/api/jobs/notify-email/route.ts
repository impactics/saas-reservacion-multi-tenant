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
  if (!isValid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

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

  if (!job || job.status === "SENT") {
    return NextResponse.json({ skipped: true });
  }

  if (!job.booking.patientEmail) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "FAILED", lastError: "Sin email del paciente" },
    });
    return NextResponse.json({ skipped: true });
  }

  const { booking } = job;
  const tz = booking.organization.timezone ?? "America/Guayaquil";
  const localDate = toZonedTime(booking.scheduledAt, tz);
  const dateStr = format(localDate, "dd/MM/yyyy");
  const timeStr = format(localDate, "HH:mm");

  const subjects: Record<string, string> = {
    BOOKING_CONFIRMED: `Confirmación de cita - ${booking.service.name}`,
    BOOKING_RESCHEDULED: `Tu cita ha sido reagendada - ${booking.service.name}`,
    BOOKING_CANCELLED: `Cita cancelada - ${booking.service.name}`,
    REMINDER_24H: `Recordatorio: tienes una cita mañana`,
  };

  const htmlBodies: Record<string, string> = {
    BOOKING_CONFIRMED: `
      <h2>✅ Reserva confirmada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita ha sido confirmada.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">📅 Fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🕐 Hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🏥 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">👨‍⚕️ Profesional</td><td style="padding:8px">${booking.professional.name}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}/reserva/${booking.id}" style="background:#01696f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Gestionar cita</a>
    `,
    BOOKING_RESCHEDULED: `
      <h2>🔄 Cita reagendada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita ha sido reagendada.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">📅 Nueva fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🕐 Nueva hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🏥 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
      </table>
    `,
    BOOKING_CANCELLED: `
      <h2>❌ Cita cancelada</h2>
      <p>Hola <strong>${booking.patientName}</strong>, tu cita del <strong>${dateStr} a las ${timeStr}</strong> ha sido cancelada.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}" style="background:#01696f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Agendar nueva cita</a>
    `,
    REMINDER_24H: `
      <h2>⏰ Recordatorio de cita</h2>
      <p>Hola <strong>${booking.patientName}</strong>, te recordamos que mañana tienes una cita.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold">📅 Fecha</td><td style="padding:8px">${dateStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🕐 Hora</td><td style="padding:8px">${timeStr}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">🏥 Servicio</td><td style="padding:8px">${booking.service.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">👨‍⚕️ Profesional</td><td style="padding:8px">${booking.professional.name}</td></tr>
      </table>
    `,
  };

  const subject = subjects[job.type];
  const html = htmlBodies[job.type];

  if (!subject || !html) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "FAILED", lastError: `Tipo desconocido: ${job.type}` },
    });
    return NextResponse.json({ error: "Tipo desconocido" }, { status: 400 });
  }

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM ?? "noreply@example.com";
    if (!resendApiKey) throw new Error("RESEND_API_KEY no configurada");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${booking.organization.name} <${fromEmail}>`,
        to: booking.patientEmail,
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
      data: { status: "SENT" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "FAILED", lastError, attempts: { increment: 1 } },
    });
    console.error("[notify-email] error", lastError);
    return NextResponse.json({ error: lastError }, { status: 500 });
  }
}
