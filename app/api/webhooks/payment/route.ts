/**
 * POST /api/webhooks/payment
 *
 * Webhook del proveedor de pagos (Stripe o MercadoPago).
 * Flujo:
 *   1. Verificar firma HMAC del proveedor
 *   2. Identificar el bookingId desde los metadatos del pago
 *   3. Actualizar Booking → status CONFIRMED + paymentStatus PAID (transacción Prisma)
 *   4. Encolar jobs de notificación via QStash
 *
 * Variables de entorno necesarias:
 *   PAYMENT_PROVIDER=stripe | mercadopago
 *   STRIPE_WEBHOOK_SECRET        (solo si PAYMENT_PROVIDER=stripe)
 *   MERCADOPAGO_WEBHOOK_SECRET   (solo si PAYMENT_PROVIDER=mercadopago)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueBookingConfirmedJobs } from "@/lib/notifications";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// Helpers de verificación de firma
// ─────────────────────────────────────────────────────────────

/**
 * Verifica la firma de Stripe usando el encabezado `Stripe-Signature`.
 * Stripe firma con HMAC-SHA256 sobre `timestamp.rawBody`.
 * Retorna true si la firma es válida y el timestamp no es mayor a 5 minutos.
 */
function verifyStripeSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k.trim(), v.trim()];
    })
  );

  const timestamp = parts["t"];
  const signatures = header
    .split(",")
    .filter((p) => p.trim().startsWith("v1="))
    .map((p) => p.trim().slice(3));

  if (!timestamp || signatures.length === 0) return false;

  // Verificar que el timestamp no tenga más de 5 minutos
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  return signatures.some((sig) =>
    crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
  );
}

/**
 * Verifica la firma de MercadoPago usando el encabezado `x-signature`.
 * MercadoPago firma con HMAC-SHA256 sobre `id:ts` del manifest.
 * Docs: https://www.mercadopago.com/developers/es/docs/your-integrations/notifications/webhooks
 */
function verifyMercadoPagoSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !xSignature) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k.trim(), v.trim()];
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = [
    dataId ? `id:${dataId}` : null,
    xRequestId ? `request-id:${xRequestId}` : null,
    `ts:${ts}`,
  ]
    .filter(Boolean)
    .join(";");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest, "utf8")
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(v1, "hex"),
    Buffer.from(expected, "hex")
  );
}

// ─────────────────────────────────────────────────────────────
// Parsers de payload por proveedor
// ─────────────────────────────────────────────────────────────

/**
 * Extrae el bookingId desde un evento de Stripe.
 * El bookingId debe enviarse en metadata al crear el PaymentIntent:
 *   stripe.paymentIntents.create({ metadata: { bookingId: "..." } })
 */
function extractFromStripe(payload: Record<string, unknown>): {
  bookingId: string | null;
  paymentId: string | null;
  isPaid: boolean;
} {
  const event = payload as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  const PAID_EVENTS = [
    "payment_intent.succeeded",
    "checkout.session.completed",
    "charge.succeeded",
  ];

  if (!event.type || !PAID_EVENTS.includes(event.type)) {
    return { bookingId: null, paymentId: null, isPaid: false };
  }

  const obj = event.data?.object ?? {};
  const meta =
    (obj.metadata as Record<string, string> | undefined) ??
    ((obj.payment_intent as Record<string, unknown> | undefined)
      ?.metadata as Record<string, string> | undefined) ??
    {};

  const paymentId =
    (obj.id as string | undefined) ??
    (obj.payment_intent as string | undefined) ??
    null;

  return {
    bookingId: meta.bookingId ?? null,
    paymentId,
    isPaid: true,
  };
}

/**
 * Extrae el bookingId desde un evento de MercadoPago.
 * El bookingId debe enviarse en external_reference al crear la preferencia:
 *   mercadopago.preferences.create({ external_reference: bookingId })
 */
function extractFromMercadoPago(payload: Record<string, unknown>): {
  bookingId: string | null;
  paymentId: string | null;
  isPaid: boolean;
} {
  const event = payload as {
    type?: string;
    action?: string;
    data?: { id?: string };
  };

  const isPayment =
    (event.type === "payment" || event.action === "payment.updated") &&
    event.data?.id;

  if (!isPayment) {
    return { bookingId: null, paymentId: null, isPaid: false };
  }

  // MercadoPago envía el ID del pago — necesitamos consultar la API para
  // obtener external_reference. Por ahora lo dejamos en el payload si viene.
  const data = payload.data as Record<string, unknown> | undefined;
  const externalRef =
    (data?.external_reference as string | undefined) ??
    (payload.external_reference as string | undefined) ??
    null;

  return {
    bookingId: externalRef,
    paymentId: event.data?.id ?? null,
    isPaid: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Leer el body crudo — necesario para verificación de firma
  const rawBody = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const provider = process.env.PAYMENT_PROVIDER ?? "stripe";

  // ── Verificar firma ──────────────────────────────────────────
  let signatureValid = false;

  if (provider === "stripe") {
    const stripeHeader = req.headers.get("stripe-signature");
    signatureValid = verifyStripeSignature(rawBody, stripeHeader);
  } else if (provider === "mercadopago") {
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    const dataId = (payload.data as Record<string, string> | undefined)?.id ?? null;
    signatureValid = verifyMercadoPagoSignature(xSignature, xRequestId, dataId);
  }

  if (!signatureValid) {
    console.warn("[webhook/payment] Firma inválida", { provider });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // ── Extraer datos del pago ───────────────────────────────────
  let bookingId: string | null = null;
  let paymentId: string | null = null;
  let isPaid = false;

  if (provider === "stripe") {
    ({ bookingId, paymentId, isPaid } = extractFromStripe(payload));
  } else if (provider === "mercadopago") {
    ({ bookingId, paymentId, isPaid } = extractFromMercadoPago(payload));
  }

  // Evento que no corresponde a un pago completado → 200 silencioso
  if (!isPaid || !bookingId) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── Obtener booking ──────────────────────────────────────────
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { organization: true },
  });

  if (!booking) {
    console.error("[webhook/payment] Booking no encontrado", { bookingId });
    // Responder 200 para que el proveedor no reintente infinitamente
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Idempotencia: si ya fue procesado, responder 200 sin duplicar jobs
  if (booking.paymentStatus === "PAID") {
    return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 });
  }

  // ── Actualizar booking (transacción atómica) ─────────────────
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentId: paymentId ?? undefined,
    },
  });

  // ── Encolar notificaciones ───────────────────────────────────
  await enqueueBookingConfirmedJobs({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    whatsappEnabled: booking.organization.whatsappEnabled,
    calendarEnabled: booking.organization.googleCalendarEnabled,
  });

  console.info("[webhook/payment] Booking confirmado", {
    bookingId,
    paymentId,
    provider,
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
