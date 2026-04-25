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
  // Verificar firma QStash
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

  const { booking } = job;
  const tz = booking.organization.timezone ?? "America/Guayaquil";
  const localDate = toZonedTime(booking.scheduledAt, tz);
  const dateStr = format(localDate, "dd/MM/yyyy");
  const timeStr = format(localDate, "HH:mm");

  // Mensajes según tipo de notificación
  const messages: Record<string, string> = {
    BOOKING_CONFIRMED: `✅ *Reserva confirmada*\n\nHola ${booking.patientName}, tu cita ha sido confirmada.\n\n📅 *Fecha:* ${dateStr}\n🕐 *Hora:* ${timeStr}\n🏥 *Servicio:* ${booking.service.name}\n👨‍⚕️ *Profesional:* ${booking.professional.name}\n\nPara reagendar o cancelar: ${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}/reserva/${booking.id}`,
    BOOKING_RESCHEDULED: `🔄 *Cita reagendada*\n\nHola ${booking.patientName}, tu cita ha sido reagendada.\n\n📅 *Nueva fecha:* ${dateStr}\n🕐 *Nueva hora:* ${timeStr}\n🏥 *Servicio:* ${booking.service.name}`,
    BOOKING_CANCELLED: `❌ *Cita cancelada*\n\nHola ${booking.patientName}, tu cita del ${dateStr} a las ${timeStr} ha sido cancelada.\n\nPuedes agendar una nueva cita en: ${process.env.NEXT_PUBLIC_APP_URL}/${booking.organization.slug}`,
    REMINDER_24H: `⏰ *Recordatorio de cita*\n\nHola ${booking.patientName}, te recordamos que mañana tienes una cita.\n\n📅 *Fecha:* ${dateStr}\n🕐 *Hora:* ${timeStr}\n🏥 *Servicio:* ${booking.service.name}\n👨‍⚕️ *Profesional:* ${booking.professional.name}`,
  };

  const message = messages[job.type];
  if (!message) {
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: {
        status: "FAILED",
        lastError: `Tipo desconocido: ${job.type}`, // campo correcto del schema
      },
    });
    return NextResponse.json({ error: "Tipo desconocido" }, { status: 400 });
  }

  try {
    const whatsappApiUrl = process.env.WHATSAPP_API_URL;
    const whatsappToken = process.env.WHATSAPP_API_TOKEN;
    const fromNumber = process.env.WHATSAPP_FROM_NUMBER;

    if (!whatsappApiUrl || !whatsappToken || !fromNumber) {
      throw new Error("WhatsApp API no configurada");
    }

    const phone = booking.patientPhone.replace(/[^0-9]/g, "");
    const toNumber = phone.startsWith("593")
      ? phone
      : `593${phone.replace(/^0/, "")}`;

    // Timeout de 10s para evitar que la función serverless cuelgue
    // si la API de Meta no responde
    const res = await fetch(whatsappApiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whatsappToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
    }

    // C-06 fix: usar los nombres correctos de campos del schema Prisma
    // Schema define: lastError (no "error"), attempts (no "retries")
    // El campo sentAt no existe en el schema — se omite
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: { status: "SENT" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    // C-06 fix: campos correctos del schema
    await prisma.notificationJob.update({
      where: { id: notificationJobId },
      data: {
        status: "FAILED",
        lastError: error,          // campo correcto (no "error")
        attempts: { increment: 1 }, // campo correcto (no "retries")
      },
    });

    console.error("[notify-whatsapp] error", error);
    // Retornar 500 para que QStash reintente automáticamente
    return NextResponse.json({ error }, { status: 500 });
  }
}
