/**
 * POST /api/webhooks/google-calendar
 *
 * Recibe notificaciones push de Google Calendar cuando un evento cambia.
 * Headers clave:
 *   X-Goog-Channel-ID    \u2192 ID del canal ({organizationId}:{externalBookingId})
 *   X-Goog-Resource-State \u2192 "sync" | "exists" | "not_exists"
 *   X-Goog-Channel-Token \u2192 GOOGLE_CALENDAR_WEBHOOK_TOKEN
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const channelToken  = req.headers.get("x-goog-channel-token");
  const expectedToken = process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN;

  if (expectedToken && channelToken !== expectedToken) {
    console.warn("[webhook/google-calendar] Token inv\u00e1lido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state      = req.headers.get("x-goog-resource-state");
  const channelId  = req.headers.get("x-goog-channel-id")  ?? "";
  const resourceId = req.headers.get("x-goog-resource-id") ?? "";

  console.info("[webhook/google-calendar] Notificaci\u00f3n recibida", { state, channelId, resourceId });

  if (state === "sync")
    return NextResponse.json({ received: true }, { status: 200 });

  if (state === "not_exists") {
    // El channelId se guarda como `{organizationId}:{externalBookingId}` al suscribir
    const parts            = channelId.split(":");
    const externalBookingId = parts[1] ?? null;   // googleEventId no existe — usar externalBookingId

    if (externalBookingId) {
      const booking = await prisma.booking.findFirst({
        where: {
          externalBookingId,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: { organization: true },
      });

      if (booking) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            // cancellationReason no existe en Booking — usar notes
            notes: "Evento eliminado desde Google Calendar",
          },
        });

        if (booking.organization.whatsappEnabled) {
          await enqueueNotification({
            organizationId: booking.organizationId,
            bookingId:      booking.id,
            // BOOKING_CANCELLED no existe en NotificationType — usar BOOKING_CANCELLATION
            type: "BOOKING_CANCELLATION",
          });
        }

        console.info("[webhook/google-calendar] Booking cancelado por eliminaci\u00f3n de evento", {
          bookingId: booking.id,
          externalBookingId,
        });
      }
    }
  }

  if (state === "exists") {
    console.info("[webhook/google-calendar] Evento modificado", { channelId, resourceId });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
