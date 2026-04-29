import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver, publishJob } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/jobs/reminder
 *
 * Cron de QStash (ej: cada hora).
 * Busca NotificationJobs BOOKING_REMINDER pendientes cuya scheduledFor lleg\u00f3,
 * y los despacha al worker de notificaciones.
 *
 * Tambi\u00e9n acepta { notificationJobId } para procesar un reminder espec\u00edfico.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid   = await qstashReceiver.verify({ signature, body });
  if (!isValid)
    return NextResponse.json({ error: "Firma inv\u00e1lida" }, { status: 401 });

  const payload = body.trim().length > 2 ? JSON.parse(body) : {};

  // Modo directo: procesar un job espec\u00edfico
  if (payload.notificationJobId) {
    await dispatchReminder(payload.notificationJobId);
    return NextResponse.json({ ok: true });
  }

  // Modo cron: buscar todos los reminders pendientes vencidos
  const now = new Date();
  const pendingReminders = await prisma.notificationJob.findMany({
    where: {
      type:         "BOOKING_REMINDER",   // REMINDER_24H no existe en el enum
      status:       "PENDING",
      scheduledFor: { lte: now },
    },
    select: { id: true },
    take: 50,
  });

  await Promise.allSettled(
    pendingReminders.map((job) => dispatchReminder(job.id))
  );

  return NextResponse.json({ dispatched: pendingReminders.length });
}

async function dispatchReminder(notificationJobId: string) {
  const job = await prisma.notificationJob.findUnique({
    where:  { id: notificationJobId },
    select: { status: true, id: true },
  });

  if (!job || job.status !== "PENDING") return;

  // Marcar como procesando para evitar doble disparo
  await prisma.notificationJob.update({
    where: { id: notificationJobId },
    data:  { status: "PROCESSING" },
  });

  // Publicar al worker de notificaciones
  await publishJob({
    path: "/api/workers/notifications",
    body: { jobId: notificationJobId },
  });
}
