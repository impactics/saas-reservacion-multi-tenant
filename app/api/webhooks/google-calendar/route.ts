/**
 * POST /api/webhooks/google-calendar
 *
 * Recibe notificaciones push de Google Calendar cuando un evento cambia.
 * Google envía una notificación vacía con headers específicos:
 *   X-Goog-Channel-ID    → ID del canal de suscripción
 *   X-Goog-Resource-ID   → ID del recurso (calendario)
 *   X-Goog-Resource-State → "sync" (inicial) | "exists" (evento creado/modificado) | "not_exists" (eliminado)
 *   X-Goog-Channel-Token → token de verificación (nuestra GOOGLE_CALENDAR_WEBHOOK_TOKEN)
 *
 * Documentación: https://developers.google.com/calendar/api/guides/push
 *
 * Estrategia:
 *   - Google Calendar es ESPEJO, no fuente de verdad (SAAS_MODEL regla #5)
 *   - Solo usamos este webhook para detectar cambios externos (ej: doctor cancela
 *     desde Google Calendar) y actualizar el Booking correspondiente.
 *   - Si el evento fue eliminado → buscar el booking por googleEventId y
 *     marcarlo como CANCELLED si sigue activo.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  // ── Verificar token de canal ──────────────────────────────────────────────
  const channelToken = req.headers.get("x-goog-channel-token");
  const expectedToken = process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN;

  // Si hay token configurado, verificarlo
  if (expectedToken && channelToken !== expectedToken) {
    console.warn("[webhook/google-calendar] Token inválido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = req.headers.get("x-goog-resource-state");
  const channelId = req.headers.get("x-goog-channel-id") ?? "";
  const resourceId = req.headers.get("x-goog-resource-id") ?? "";

  console.info("[webhook/google-calendar] Notificación recibida", {
    state,
    channelId,
    resourceId,
  });

  // ── Ignorar notificación de sincronización inicial ────────────────────────
  if (state === "sync") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── Evento eliminado desde Google Calendar ────────────────────────────────
  // El channelId lo guardamos como `{organizationId}:{googleEventId}` al suscribir.
  // Alternativa: el body puede traer el eventId en algunos casos.
  if (state === "not_exists") {
    const parts = channelId.split(":");
    const googleEventId = parts[1] ?? null;

    if (googleEventId) {
      const booking = await prisma.booking.findFirst({
        where: {
          googleEventId,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: { organization: true },
      });

      if (booking) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancellationReason: "Evento eliminado desde Google Calendar",
          },
        });

        // Notificar al paciente via WhatsApp si está habilitado
        if (booking.organization.whatsappEnabled) {
          await enqueueNotification({
            organizationId: booking.organizationId,
            bookingId: booking.id,
            type: "BOOKING_CANCELLED",
            channel: "WHATSAPP",
          });
        }

        console.info("[webhook/google-calendar] Booking cancelado por eliminación de evento", {
          bookingId: booking.id,
          googleEventId,
        });
      }
    }
  }

  // ── Evento modificado: registrar para revisión futura ────────────────────
  // Por ahora solo logeamos. En una v2 podríamos comparar la hora del evento
  // con la del booking y reagendar automáticamente.
  if (state === "exists") {
    console.info("[webhook/google-calendar] Evento modificado", { channelId, resourceId });
  }

  // Google requiere siempre respuesta 200 para no desuscribir el canal
  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * Google Calendar también usa GET para verificar el endpoint durante la
 * configuración del canal push. Respondemos 200 siempre.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
