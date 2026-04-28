/**
 * POST /api/[slug]/checkout
 *
 * Crea una sesión de pago para un booking PENDING_PAYMENT.
 *
 * Proveedores soportados (PAYMENT_PROVIDER en .env):
 *   stripe      → { provider, clientSecret, publishableKey, amount, currency }
 *   mercadopago → { provider, initPoint, sandboxInitPoint, preferenceId }
 *   payphone    → { provider, paymentUrl, paymentId }
 *   paypal      → { provider, orderId, clientId }
 *
 * Body: { bookingId: string, returnUrl?: string, cancelUrl?: string }
 *
 * returnUrl y cancelUrl son opcionales: el ecommerce los pasa para que el
 * usuario vuelva al ecommerce después del pago en lugar del SaaS.
 * Si no se envían, se usa NEXT_PUBLIC_APP_URL como fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withCors, corsOptions, getAllowedOrigins } from "@/lib/cors";

const CheckoutSchema = z.object({
  bookingId: z.string().min(1),
  returnUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
});

// Preflight CORS
export function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = req.headers.get("origin");
  const origins = getAllowedOrigins();

  try {
    const { slug } = await params;
    const body = CheckoutSchema.safeParse(await req.json());
    if (!body.success) {
      return withCors(
        NextResponse.json({ error: "Datos inválidos" }, { status: 400 }),
        origin, origins
      );
    }

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return withCors(
        NextResponse.json({ error: "Organización no encontrada" }, { status: 404 }),
        origin, origins
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id: body.data.bookingId, organizationId: org.id },
      include: {
        service: { select: { name: true, price: true, currency: true } },
        professional: { select: { name: true } },
      },
    });

    if (!booking) {
      return withCors(
        NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 }),
        origin, origins
      );
    }

    if (booking.paymentStatus === "PAID") {
      return withCors(
        NextResponse.json({ error: "Esta reserva ya fue pagada" }, { status: 409 }),
        origin, origins
      );
    }

    const price = booking.service.price ? Number(booking.service.price) : 0;
    const currency = (booking.service.currency ?? "USD").toUpperCase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const provider = process.env.PAYMENT_PROVIDER ?? "stripe";

    // URLs de retorno: el ecommerce las pasa en el body; si no, usamos el SaaS
    const returnUrl =
      body.data.returnUrl ??
      `${appUrl}/${slug}/booking/confirmacion?bookingId=${booking.id}`;
    const cancelUrl =
      body.data.cancelUrl ??
      `${appUrl}/${slug}/checkout/${booking.serviceId}?bookingId=${booking.id}&error=cancelled`;

    // ── STRIPE ────────────────────────────────────────────────────────────────
    if (provider === "stripe") {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
        apiVersion: "2025-01-27.acacia",
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(price * 100),
        currency: currency.toLowerCase(),
        metadata: { bookingId: booking.id, organizationId: org.id, slug },
        description: `${booking.service.name} — ${org.name}`,
        receipt_email: booking.patientEmail ?? undefined,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: paymentIntent.id },
      });

      return withCors(
        NextResponse.json({
          provider: "stripe",
          clientSecret: paymentIntent.client_secret,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
          amount: price,
          currency,
        }),
        origin, origins
      );
    }

    // ── MERCADOPAGO ──────────────────────────────────────────────────────────
    if (provider === "mercadopago") {
      const { MercadoPagoConfig, Preference } = await import("mercadopago");
      const mp = new MercadoPagoConfig({
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
      });

      const preference = await new Preference(mp).create({
        body: {
          items: [{
            id: booking.serviceId,
            title: booking.service.name,
            quantity: 1,
            unit_price: price,
            currency_id: currency,
          }],
          external_reference: booking.id,
          payer: {
            name: booking.patientName,
            email: booking.patientEmail ?? undefined,
            phone: { number: booking.patientPhone },
          },
          back_urls: {
            success: returnUrl,
            failure: cancelUrl,
            pending: `${returnUrl}&pending=true`,
          },
          auto_return: "approved",
          metadata: { bookingId: booking.id, organizationId: org.id },
        },
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: preference.id ?? null },
      });

      return withCors(
        NextResponse.json({
          provider: "mercadopago",
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point,
          preferenceId: preference.id,
        }),
        origin, origins
      );
    }

    // ── PAYPHONE ─────────────────────────────────────────────────────────────
    if (provider === "payphone") {
      const { createPayphoneLink } = await import("@/lib/payphone");

      const link = await createPayphoneLink({
        amount: Math.round(price * 100),
        currency,
        bookingId: booking.id,
        clientTransactionId: booking.id,
        callbackUrl: `${appUrl}/api/webhooks/payment`,
        cancellationUrl: cancelUrl,
        reference: `${booking.service.name} — ${org.name}`,
        email: booking.patientEmail ?? undefined,
        phoneNumber: booking.patientPhone ?? undefined,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: String(link.paymentId) },
      });

      return withCors(
        NextResponse.json({
          provider: "payphone",
          paymentUrl: link.paymentUrl,
          paymentId: link.paymentId,
        }),
        origin, origins
      );
    }

    // ── PAYPAL ───────────────────────────────────────────────────────────────
    if (provider === "paypal") {
      const { default: checkoutNodeJssdk } = await import(
        "@paypal/checkout-server-sdk"
      );

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

      const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);
      const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: booking.id,
          description: `${booking.service.name} — ${org.name}`,
          amount: {
            currency_code: currency,
            value: price.toFixed(2),
          },
          custom_id: booking.id,
        }],
        application_context: {
          brand_name: org.name,
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      });

      const order = await client.execute(request);
      const orderId: string = order.result.id;

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: orderId },
      });

      return withCors(
        NextResponse.json({
          provider: "paypal",
          orderId,
          clientId: process.env.PAYPAL_CLIENT_ID,
          amount: price,
          currency,
        }),
        origin, origins
      );
    }

    return withCors(
      NextResponse.json(
        { error: `Proveedor "${provider}" no soportado` },
        { status: 500 }
      ),
      origin, origins
    );
  } catch (err) {
    console.error("[checkout] error", err);
    return withCors(
      NextResponse.json({ error: "Error interno" }, { status: 500 }),
      origin, origins
    );
  }
}
