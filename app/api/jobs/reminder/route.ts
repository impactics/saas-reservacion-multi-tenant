import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver, publishJob } from "@/lib/qstash";
import { prisma } from "@/lib/prisma";
import { NotificationStatus } from "@/app/generated/prisma";

export const runtime = "nodejs";

/**
 * POST /api/jobs/reminder
 *
 * Cron de QStash (ej: cada hora).
 * Busca NotificationJobs BOOKING_REMINDER pendientes cuya scheduledFor llegó,
 * y los despacha al worker de notificaciones.
 *
 * También acepta { notificationJobId } para procesar un reminder específico.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const isValid   = await qstashReceiver.verify({ signature, body });
  if (!isValid)
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

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
      type:         "BOOKING_REMINDER",
      status:       NotificationStatus.PENDING,
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

  if (!job || job.status !== NotificationStatus.PENDING) return;

  // Marcar como procesando para evitar doble disparo
  await prisma.notificationJob.update({
    where: { id: notificationJobId },
    data:  { status: NotificationStatus.PROCESSING },
  });

  // Publicar al worker de notificaciones
  await publishJob({
    path: "/api/workers/notifications",
    body: { jobId: notificationJobId },
  });
}
