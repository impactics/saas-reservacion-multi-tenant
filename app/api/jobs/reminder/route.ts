import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver, publishJob } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Este job lo dispara un cron de QStash (ej: cada hora).
 * Busca NotificationJobs de tipo REMINDER_24H pendientes cuya
 * scheduledFor ya llegó, y los despacha al worker de WhatsApp.
 *
 * También se puede llamar directamente con un payload
 * { notificationJobId } para procesar un reminder específico.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid = await qstashReceiver.verify({ signature, body });
  if (!isValid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const payload = body.trim().length > 2 ? JSON.parse(body) : {};

  // Modo directo: procesar un job específico
  if (payload.notificationJobId) {
    await dispatchReminder(payload.notificationJobId);
    return NextResponse.json({ ok: true });
  }

  // Modo cron: buscar todos los reminders pendientes vencidos
  const now = new Date();
  const pendingReminders = await prisma.notificationJob.findMany({
    where: {
      type: "REMINDER_24H",
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    select: { id: true },
    take: 50, // procesar en lotes
  });

  await Promise.allSettled(
    pendingReminders.map((job) => dispatchReminder(job.id))
  );

  return NextResponse.json({ dispatched: pendingReminders.length });
}

async function dispatchReminder(notificationJobId: string) {
  const job = await prisma.notificationJob.findUnique({
    where: { id: notificationJobId },
    include: {
      booking: { include: { organization: true } },
    },
  });

  if (!job || job.status !== "PENDING") return;

  // Marcar como procesando para evitar doble disparo
  await prisma.notificationJob.update({
    where: { id: notificationJobId },
    data: { status: "PROCESSING" },
  });

  // Publicar al worker de WhatsApp
  await publishJob({
    path: "/api/jobs/notify-whatsapp",
    body: { notificationJobId },
  });

  // Si la org tiene email habilitado y el paciente tiene email, también email
  if (job.booking.patientEmail && job.booking.organization.emailEnabled) {
    await enqueueNotification({
      organizationId: job.booking.organizationId,
      bookingId: job.booking.id,
      type: "REMINDER_24H",
      channel: "EMAIL",
    });
  }
}
