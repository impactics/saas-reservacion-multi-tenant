/**
 * POST /api/webhooks/payment
 *
 * Receptor único para eventos de pago.
 * Proveedores: Payphone y PayPal.
 *
 * PAYPHONE
 *   Body: { clientTransactionId, transactionStatus, id }
 *   Verificamos con POST /api/button/Payments/verify
 *   clientTransactionId === bookingId
 *
 * PAYPAL
 *   Header: paypal-transmission-sig + paypal-cert-url
 *   Evento: PAYMENT.CAPTURE.COMPLETED
 *   Verificación de firma vía REST API de PayPal (sin SDK viejo)
 *   resource.purchase_units[0].custom_id === bookingId
 *
 * Idempotencia: booking ya PAID → 200 sin reprocesar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const paypalSig = req.headers.get("paypal-transmission-sig");
  if (paypalSig) return handlePayPal(req);
  return handlePayphone(req);
}

// ── PAYPHONE ──────────────────────────────────────────────────────────────────

async function handlePayphone(req: NextRequest) {
  let body: {
    clientTransactionId?: string;
    transactionStatus?: number;
    id?: string | number;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  if (!body.clientTransactionId) {
    return NextResponse.json({ error: "Proveedor no reconocido" }, { status: 400 });
  }

  const bookingId = body.clientTransactionId;
  const rawId = String(body.id ?? "");

  try {
    const { verifyPayphonePayment } = await import("@/lib/payphone");
    const result = await verifyPayphonePayment(rawId, bookingId);

    if (!result.approved) {
      console.info("[webhook/payment] Payphone: pago no aprobado", { bookingId });
      return NextResponse.json({ received: true });
    }

    await confirmBooking(bookingId, result.paymentId);
  } catch (err) {
    console.error("[webhook/payment] Payphone error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── PAYPAL ──────────────────────────────────────────────────────────────────

async function handlePayPal(req: NextRequest) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";
  const rawBody = await req.text();

  const transmissionId  = req.headers.get("paypal-transmission-id")  ?? "";
  const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";
  const certUrl         = req.headers.get("paypal-cert-url")          ?? "";
  const authAlgo        = req.headers.get("paypal-auth-algo")         ?? "";
  const transmissionSig = req.headers.get("paypal-transmission-sig")  ?? "";

  // Verificación de firma usando la REST API de PayPal directamente
  // (no necesitamos el SDK viejo para esto)
  if (webhookId) {
    try {
      const tokenRes = await fetch(
        `https://api${process.env.PAYPAL_ENV === "production" ? "" : ".sandbox"}.paypal.com/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
            ).toString("base64")}`,
          },
          body: "grant_type=client_credentials",
        }
      );
      const { access_token } = await tokenRes.json() as { access_token: string };

      const verifyRes = await fetch(
        `https://api${process.env.PAYPAL_ENV === "production" ? "" : ".sandbox"}.paypal.com/v1/notifications/verify-webhook-signature`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify({
            transmission_id: transmissionId,
            transmission_time: transmissionTime,
            cert_url: certUrl,
            auth_algo: authAlgo,
            transmission_sig: transmissionSig,
            webhook_id: webhookId,
            webhook_event: JSON.parse(rawBody),
          }),
        }
      );

      const { verification_status } = await verifyRes.json() as { verification_status: string };
      if (verification_status !== "SUCCESS") {
        console.warn("[webhook/payment] PayPal firma inválida");
        return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
      }
    } catch (err) {
      console.error("[webhook/payment] PayPal verificación error", err);
      return NextResponse.json({ error: "Error de verificación" }, { status: 400 });
    }
  }

  let event: {
    event_type?: string;
    resource?: {
      id?: string;
      purchase_units?: Array<{ custom_id?: string }>;
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };

  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ received: true });
  }

  const bookingId =
    event.resource?.purchase_units?.[0]?.custom_id ??
    event.resource?.supplementary_data?.related_ids?.order_id;
  const captureId = event.resource?.id;

  if (!bookingId || !captureId) {
    console.warn("[webhook/payment] PayPal: evento sin bookingId o captureId");
    return NextResponse.json({ received: true });
  }

  await confirmBooking(bookingId, captureId);
  return NextResponse.json({ received: true });
}

// ── confirmBooking — función compartida ────────────────────────────────────

async function confirmBooking(bookingId: string, paymentId: string) {
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { paymentStatus: true },
  });

  if (!existing) {
    console.warn("[webhook/payment] Booking no encontrado", bookingId);
    return;
  }

  if (existing.paymentStatus === "PAID") {
    console.info("[webhook/payment] Idempotente — ya confirmado", bookingId);
    return;
  }

  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED", paymentStatus: "PAID", paymentId },
    include: {
      organization: {
        select: { whatsappEnabled: true, googleCalendarEnabled: true },
      },
    },
  });

  console.info("[webhook/payment] Booking confirmado", { bookingId, paymentId });

  await enqueueBookingConfirmedJobs({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    whatsappEnabled: booking.organization.whatsappEnabled,
    calendarEnabled: booking.organization.googleCalendarEnabled,
  });
}
