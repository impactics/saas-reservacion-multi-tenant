/**
 * POST /api/webhooks/payment
 *
 * Receptor \u00fanico para eventos de pago.
 * Proveedores: Payphone y PayPal.
 *
 * PAYPHONE
 *   Body: { clientTransactionId, transactionStatus, id }
 *   clientTransactionId === bookingId
 *
 * PAYPAL
 *   Header: paypal-transmission-sig + paypal-cert-url
 *   Evento: PAYMENT.CAPTURE.COMPLETED
 *   resource.purchase_units[0].custom_id === bookingId
 *
 * Idempotencia: booking ya PAID \u2192 200 sin reprocesar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const paypalSig = req.headers.get("paypal-transmission-sig");
  if (paypalSig) return handlePayPal(req);
  return handlePayphone(req);
}

// \u2500\u2500 PAYPHONE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function handlePayphone(req: NextRequest) {
  let body: {
    clientTransactionId?: string;
    transactionStatus?:   number;
    id?:                  string | number;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inv\u00e1lido" }, { status: 400 }); }

  if (!body.clientTransactionId)
    return NextResponse.json({ error: "Proveedor no reconocido" }, { status: 400 });

  const bookingId = body.clientTransactionId;
  const rawId     = String(body.id ?? "");

  try {
    const { verifyPayphonePayment } = await import("@/lib/payphone");
    const result = await verifyPayphonePayment(rawId, bookingId);

    if (!result.approved) {
      console.info("[webhook/payment] Payphone: pago no aprobado", { bookingId });
      return NextResponse.json({ received: true });
    }

    await confirmBooking(bookingId, String(result.paymentId));
  } catch (err) {
    console.error("[webhook/payment] Payphone error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// \u2500\u2500 PAYPAL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function handlePayPal(req: NextRequest) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";
  const rawBody   = await req.text();

  const transmissionId   = req.headers.get("paypal-transmission-id")   ?? "";
  const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";
  const certUrl          = req.headers.get("paypal-cert-url")           ?? "";
  const authAlgo         = req.headers.get("paypal-auth-algo")          ?? "";
  const transmissionSig  = req.headers.get("paypal-transmission-sig")  ?? "";

  if (webhookId) {
    try {
      const tokenRes = await fetch(
        `https://api${process.env.PAYPAL_ENV === "production" ? "" : ".sandbox"}.paypal.com/v1/oauth2/token`,
        {
          method:  "POST",
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
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify({
            transmission_id:   transmissionId,
            transmission_time: transmissionTime,
            cert_url:          certUrl,
            auth_algo:         authAlgo,
            transmission_sig:  transmissionSig,
            webhook_id:        webhookId,
            webhook_event:     JSON.parse(rawBody),
          }),
        }
      );

      const { verification_status } = await verifyRes.json() as { verification_status: string };
      if (verification_status !== "SUCCESS") {
        console.warn("[webhook/payment] PayPal firma inv\u00e1lida");
        return NextResponse.json({ error: "Firma inv\u00e1lida" }, { status: 400 });
      }
    } catch (err) {
      console.error("[webhook/payment] PayPal verificaci\u00f3n error", err);
      return NextResponse.json({ error: "Error de verificaci\u00f3n" }, { status: 400 });
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
  catch { return NextResponse.json({ error: "Body inv\u00e1lido" }, { status: 400 }); }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED")
    return NextResponse.json({ received: true });

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

// \u2500\u2500 confirmBooking \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n// paymentId (externo) se guarda en el campo paymentMethod del Booking
async function confirmBooking(bookingId: string, externalPaymentId: string) {
  const existing = await prisma.booking.findUnique({
    where:  { id: bookingId },
    select: { paymentStatus: true },
  });

  if (!existing) {
    console.warn("[webhook/payment] Booking no encontrado", bookingId);
    return;
  }
  if (existing.paymentStatus === "PAID") {
    console.info("[webhook/payment] Idempotente \u2014 ya confirmado", bookingId);
    return;
  }

  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status:        "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: externalPaymentId,  // paymentId no existe — usamos paymentMethod
    },
    include: {
      organization: {
        select: { whatsappEnabled: true, googleCalendarEnabled: true },
      },
    },
  });

  console.info("[webhook/payment] Booking confirmado", { bookingId, externalPaymentId });

  await enqueueBookingConfirmedJobs({
    organizationId:  booking.organizationId,
    bookingId:       booking.id,
    startTime:       booking.startTime,
    whatsappEnabled: booking.organization.whatsappEnabled,
    calendarEnabled: booking.organization.googleCalendarEnabled,
  });
}
