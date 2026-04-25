/**
 * POST /api/webhooks/payment
 *
 * Receptor único para eventos de pago de Stripe y MercadoPago.
 * Detecta el proveedor por el header de firma y delega al handler correspondiente.
 *
 * STRIPE
 *   Header: stripe-signature
 *   Evento relevante: payment_intent.succeeded
 *   Metadata: { bookingId, organizationId, slug }
 *
 * MERCADOPAGO
 *   Header: x-signature + x-request-id
 *   Evento relevante: payment (action: payment.updated, data.status: approved)
 *   Referencia: external_reference = bookingId
 *
 * Flujo exitoso (ambos proveedores):
 *   1. Verificar firma criptográfica del payload
 *   2. Extraer bookingId del pago
 *   3. Actualizar Booking → status=CONFIRMED, paymentStatus=PAID, paymentId
 *   4. enqueueBookingConfirmedJobs() → WhatsApp + Google Calendar + recordatorio 24h
 *   5. Responder 200 (cualquier otro código reintentará el webhook)
 *
 * Idempotencia: si el booking ya está PAID se responde 200 sin procesar.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";

// ── Punto de entrada ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const stripeSignature = req.headers.get("stripe-signature");
  const mpSignature = req.headers.get("x-signature");

  if (stripeSignature) {
    return handleStripe(req, stripeSignature);
  }

  if (mpSignature) {
    return handleMercadoPago(req);
  }

  // Sin firma reconocida — rechazar
  return NextResponse.json({ error: "Proveedor no reconocido" }, { status: 400 });
}

// ── STRIPE ──────────────────────────────────────────────────────────────────

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

  // Solo nos interesa el pago exitoso
  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const paymentIntent = event.data.object as {
    id: string;
    metadata: { bookingId?: string; organizationId?: string };
  };

  const bookingId = paymentIntent.metadata?.bookingId;
  if (!bookingId) {
    console.warn("[webhook/payment] Stripe: PaymentIntent sin bookingId en metadata", paymentIntent.id);
    return NextResponse.json({ received: true });
  }

  await confirmBooking(bookingId, paymentIntent.id);
  return NextResponse.json({ received: true });
}

// ── MERCADOPAGO ─────────────────────────────────────────────────────────────

async function handleMercadoPago(req: NextRequest) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  // Verificar firma HMAC-SHA256 según doc oficial de MercadoPago
  // https://www.mercadopago.com/developers/es/docs/your-integrations/notifications/webhooks#bookmark_verificar_la_firma_de_la_notificación
  if (webhookSecret) {
    const url = req.nextUrl.toString();
    const dataId = req.nextUrl.searchParams.get("data.id") ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${xSignature.split("ts=")[1]?.split(",")[0] ?? ""};`;

    const { createHmac } = await import("crypto");
    const hash = createHmac("sha256", webhookSecret)
      .update(manifest)
      .digest("hex");

    const v1 = xSignature.split("v1=")[1]?.split(",")[0] ?? "";
    if (hash !== v1) {
      console.warn("[webhook/payment] MercadoPago firma inválida", { url, xSignature });
      return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
    }
  }

  // Parsear body
  let body: { type?: string; action?: string; data?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Solo eventos de pago aprobado
  if (body.type !== "payment" && body.action !== "payment.updated") {
    return NextResponse.json({ received: true });
  }

  const paymentId = body.data?.id;
  if (!paymentId) return NextResponse.json({ received: true });

  // Obtener detalles del pago desde la API de MP para verificar estado y external_reference
  try {
    const { MercadoPagoConfig, Payment } = await import("mercadopago");
    const mp = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
    });

    const payment = await new Payment(mp).get({ id: paymentId });

    if (payment.status !== "approved") {
      console.info("[webhook/payment] MercadoPago: pago no aprobado", { paymentId, status: payment.status });
      return NextResponse.json({ received: true });
    }

    const bookingId = payment.external_reference;
    if (!bookingId) {
      console.warn("[webhook/payment] MercadoPago: pago sin external_reference", paymentId);
      return NextResponse.json({ received: true });
    }

    await confirmBooking(bookingId, String(paymentId));
  } catch (err) {
    console.error("[webhook/payment] MercadoPago: error al obtener pago", err);
    // Devolver 500 para que MP reintente
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── confirmBooking — función compartida ──────────────────────────────────────────

async function confirmBooking(bookingId: string, paymentId: string) {
  // Idempotencia: si ya está PAID no hacer nada
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { paymentStatus: true, organizationId: true },
  });

  if (!existing) {
    console.warn("[webhook/payment] Booking no encontrado", bookingId);
    return;
  }

  if (existing.paymentStatus === "PAID") {
    console.info("[webhook/payment] Booking ya confirmado (idempotente)", bookingId);
    return;
  }

  // Actualizar booking
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentId,
    },
    include: {
      organization: {
        select: {
          whatsappEnabled: true,
          googleCalendarEnabled: true,
        },
      },
    },
  });

  console.info("[webhook/payment] Booking confirmado", { bookingId, paymentId });

  // Encolar notificaciones: WhatsApp + Google Calendar + recordatorio 24h
  await enqueueBookingConfirmedJobs({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    whatsappEnabled: booking.organization.whatsappEnabled,
    calendarEnabled: booking.organization.googleCalendarEnabled,
  });
}
