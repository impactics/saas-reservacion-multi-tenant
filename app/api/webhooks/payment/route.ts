/**
 * POST /api/webhooks/payment
 *
 * Receptor único para eventos de todos los proveedores de pago.
 * Detecta el proveedor por los headers de firma.
 *
 * STRIPE
 *   Header: stripe-signature
 *   Evento: payment_intent.succeeded
 *   Metadata: { bookingId }
 *
 * MERCADOPAGO
 *   Header: x-signature + x-request-id
 *   Evento: payment.updated (status: approved)
 *   Referencia: external_reference = bookingId
 *
 * PAYPHONE
 *   Header: (sin header especial — Payphone usa query params)
 *   Body: { clientTransactionId, transactionStatus, id }
 *   Verificamos con POST /api/button/Payments/verify
 *   clientTransactionId === bookingId
 *
 * PAYPAL
 *   Header: paypal-transmission-sig + paypal-cert-url
 *   Evento: PAYMENT.CAPTURE.COMPLETED
 *   resource.purchase_units[0].custom_id === bookingId
 *
 * Idempotencia: booking ya PAID → 200 sin reprocesar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";

// ── Punto de entrada ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const stripeSignature = req.headers.get("stripe-signature");
  const mpSignature = req.headers.get("x-signature");
  const paypalSig = req.headers.get("paypal-transmission-sig");

  if (stripeSignature) return handleStripe(req, stripeSignature);
  if (mpSignature) return handleMercadoPago(req);
  if (paypalSig) return handlePayPal(req);

  // Payphone no envía un header de firma propio —
  // detectamos por el body (campo clientTransactionId)
  return handlePayphone(req);
}

// ── STRIPE ───────────────────────────────────────────────────────────────────

async function handleStripe(req: NextRequest, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const rawBody = await req.text();

  let event;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2025-01-27.acacia",
    });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[webhook/payment] Stripe firma inválida", err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const pi = event.data.object as { id: string; metadata: { bookingId?: string } };
  const bookingId = pi.metadata?.bookingId;
  if (!bookingId) {
    console.warn("[webhook/payment] Stripe: PI sin bookingId", pi.id);
    return NextResponse.json({ received: true });
  }

  await confirmBooking(bookingId, pi.id);
  return NextResponse.json({ received: true });
}

// ── MERCADOPAGO ──────────────────────────────────────────────────────────────

async function handleMercadoPago(req: NextRequest) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  if (webhookSecret) {
    const dataId = req.nextUrl.searchParams.get("data.id") ?? "";
    const ts = xSignature.split("ts=")[1]?.split(",")[0] ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const { createHmac } = await import("crypto");
    const hash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
    const v1 = xSignature.split("v1=")[1]?.split(",")[0] ?? "";
    if (hash !== v1) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
    }
  }

  let body: { type?: string; action?: string; data?: { id?: string } };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  if (body.type !== "payment" && body.action !== "payment.updated") {
    return NextResponse.json({ received: true });
  }

  const paymentId = body.data?.id;
  if (!paymentId) return NextResponse.json({ received: true });

  try {
    const { MercadoPagoConfig, Payment } = await import("mercadopago");
    const mp = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "" });
    const payment = await new Payment(mp).get({ id: paymentId });

    if (payment.status !== "approved") {
      return NextResponse.json({ received: true });
    }

    const bookingId = payment.external_reference;
    if (!bookingId) return NextResponse.json({ received: true });

    await confirmBooking(bookingId, String(paymentId));
  } catch (err) {
    console.error("[webhook/payment] MercadoPago error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── PAYPHONE ─────────────────────────────────────────────────────────────────
// Doc: https://developers.payphone.app/docs/webhooks
// Payphone llama al responseUrl (nuestro webhook) con un POST que incluye:
//   { clientTransactionId, transactionStatus, id, ... }
// transactionStatus: 3 = Aprobado
// Verificamos el pago con la API de Payphone para evitar fraude.

async function handlePayphone(req: NextRequest) {
  let body: {
    clientTransactionId?: string;
    transactionStatus?: number;
    id?: string | number;
  };

  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  // Si no tiene clientTransactionId → no es Payphone
  if (!body.clientTransactionId) {
    return NextResponse.json({ error: "Proveedor no reconocido" }, { status: 400 });
  }

  const bookingId = body.clientTransactionId;
  const rawId = String(body.id ?? "");

  try {
    const { verifyPayphonePayment } = await import("@/lib/payphone");
    const result = await verifyPayphonePayment(rawId, bookingId);

    if (!result.approved) {
      console.info("[webhook/payment] Payphone: pago no aprobado", {
        bookingId,
        transactionStatus: result.transactionStatus,
      });
      return NextResponse.json({ received: true });
    }

    await confirmBooking(bookingId, result.paymentId);
  } catch (err) {
    console.error("[webhook/payment] Payphone error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── PAYPAL ───────────────────────────────────────────────────────────────────
// Evento: PAYMENT.CAPTURE.COMPLETED
// Doc: https://developer.paypal.com/docs/api/webhooks/v1/
// Verificamos la firma con la API de PayPal (verificación asimétrica).

async function handlePayPal(req: NextRequest) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";
  const rawBody = await req.text();

  // Encabezados necesarios para la verificación
  const transmissionId = req.headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";
  const certUrl = req.headers.get("paypal-cert-url") ?? "";
  const authAlgo = req.headers.get("paypal-auth-algo") ?? "";
  const transmissionSig = req.headers.get("paypal-transmission-sig") ?? "";

  // Verificación de firma con la API de PayPal
  if (webhookId) {
    try {
      const { default: checkoutNodeJssdk } = await import("@paypal/checkout-server-sdk");
      const environment =
        process.env.PAYPAL_ENV === "production"
          ? new checkoutNodeJssdk.core.LiveEnvironment(
              process.env.PAYPAL_CLIENT_ID ?? "",
              process.env.PAYPAL_CLIENT_SECRET ?? ""
            )
          : new checkoutNodeJssdk.core.SandboxEnvironment(
              process.env.PAYPAL_CLIENT_ID ?? "",
              process.env.PAYPAL_CLIENT_SECRET ?? ""
            );

      const ppClient = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

      // POST /v1/notifications/verify-webhook-signature
      const verifyReq = {
        path: "/v1/notifications/verify-webhook-signature",
        verb: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: webhookId,
          webhook_event: JSON.parse(rawBody),
        },
      };

      const verifyRes = await ppClient.execute(verifyReq as Parameters<typeof ppClient.execute>[0]);
      if (verifyRes.result?.verification_status !== "SUCCESS") {
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

  // custom_id lo seteamos en checkout como bookingId
  const bookingId = event.resource?.purchase_units?.[0]?.custom_id
    ?? event.resource?.supplementary_data?.related_ids?.order_id;

  const captureId = event.resource?.id;

  if (!bookingId || !captureId) {
    console.warn("[webhook/payment] PayPal: evento sin bookingId o captureId");
    return NextResponse.json({ received: true });
  }

  await confirmBooking(bookingId, captureId);
  return NextResponse.json({ received: true });
}

// ── confirmBooking — función compartida ──────────────────────────────────────

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
