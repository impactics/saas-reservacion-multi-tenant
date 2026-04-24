import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Worker endpoint llamado por Upstash QStash.
 * Procesa un NotificationJob por llamada.
 * Verifica la firma de QStash antes de ejecutar (TODO: agregar verifySignatureAppRouter).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = body as { jobId: string };

    if (!jobId) {
      return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
    }

    const job = await prisma.notificationJob.findUnique({
      where: { id: jobId },
      include: {
        booking: {
          include: {
            professional: true,
            service: true,
            organization: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
    }

    if (job.status === "SENT") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Marcar como en proceso
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { attempts: { increment: 1 } },
    });

    try {
      if (job.channel === "WHATSAPP") {
        // TODO: integrar Twilio / Meta Business API
        // await sendWhatsAppMessage({ job });
        console.log(`[worker] WhatsApp pendiente de implementar - job ${job.id}`);
      } else if (job.channel === "CALENDAR") {
        // TODO: integrar googleapis
        // await syncGoogleCalendarEvent({ job });
        console.log(`[worker] Google Calendar pendiente de implementar - job ${job.id}`);
      }

      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: "SENT" },
      });

      return NextResponse.json({ ok: true });
    } catch (sendErr) {
      const errorMsg =
        sendErr instanceof Error ? sendErr.message : "Error desconocido";
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: errorMsg },
      });
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
  } catch (err) {
    console.error("[worker/notifications] error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
