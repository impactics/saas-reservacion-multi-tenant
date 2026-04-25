/**
 * POST /api/[slug]/checkout
 *
 * Crea una sesión de pago para un booking PENDING.
 *
 * Proveedores soportados (PAYMENT_PROVIDER en .env):
 *   stripe      → { provider, clientSecret, publishableKey, amount, currency }
 *   mercadopago → { provider, initPoint, sandboxInitPoint, preferenceId }
 *   payphone    → { provider, paymentUrl, paymentId }
 *   paypal      → { provider, orderId, clientId }
 *
 * Body: { bookingId: string }
 *
 * El bookingId se guarda en metadata/reference de cada proveedor
 * para que el webhook lo recupere y confirme la reserva.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CheckoutSchema = z.object({
  bookingId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = CheckoutSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: body.data.bookingId, organizationId: org.id },
      include: {
        service: { select: { name: true, price: true, currency: true } },
        professional: { select: { name: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (booking.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Esta reserva ya fue pagada" }, { status: 409 });
    }

    const price = booking.service.price ? Number(booking.service.price) : 0;
    const currency = (booking.service.currency ?? "USD").toUpperCase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const provider = process.env.PAYMENT_PROVIDER ?? "stripe";

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

      return NextResponse.json({
        provider: "stripe",
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        amount: price,
        currency,
      });
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
            success: `${appUrl}/${slug}/booking/confirmacion?bookingId=${booking.id}`,
            failure: `${appUrl}/${slug}/checkout/${booking.serviceId}?bookingId=${booking.id}&error=payment_failed`,
            pending: `${appUrl}/${slug}/booking/confirmacion?bookingId=${booking.id}&pending=true`,
          },
          auto_return: "approved",
          metadata: { bookingId: booking.id, organizationId: org.id },
        },
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: preference.id ?? null },
      });

      return NextResponse.json({
        provider: "mercadopago",
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
        preferenceId: preference.id,
      });
    }

    // ── PAYPHONE ─────────────────────────────────────────────────────────────
    if (provider === "payphone") {
      const { createPayphoneLink } = await import("@/lib/payphone");

      const link = await createPayphoneLink({
        amount: Math.round(price * 100), // centavos
        currency,
        bookingId: booking.id,
        clientTransactionId: booking.id, // único por transacción
        callbackUrl: `${appUrl}/api/webhooks/payment`,
        cancellationUrl: `${appUrl}/${slug}/checkout/${booking.serviceId}?bookingId=${booking.id}&error=cancelled`,
        reference: `${booking.service.name} — ${org.name}`,
        email: booking.patientEmail ?? undefined,
        phoneNumber: booking.patientPhone ?? undefined,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: String(link.paymentId) },
      });

      return NextResponse.json({
        provider: "payphone",
        paymentUrl: link.paymentUrl,
        paymentId: link.paymentId,
      });
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
          custom_id: booking.id, // recuperamos en el webhook
        }],
        application_context: {
          brand_name: org.name,
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url: `${appUrl}/${slug}/booking/confirmacion?bookingId=${booking.id}`,
          cancel_url: `${appUrl}/${slug}/checkout/${booking.serviceId}?bookingId=${booking.id}&error=cancelled`,
        },
      });

      const order = await client.execute(request);
      const orderId: string = order.result.id;

      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: orderId },
      });

      return NextResponse.json({
        provider: "paypal",
        orderId,
        clientId: process.env.PAYPAL_CLIENT_ID,
        amount: price,
        currency,
      });
    }

    return NextResponse.json(
      { error: `Proveedor "${provider}" no soportado` },
      { status: 500 }
    );
  } catch (err) {
    console.error("[checkout] error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
