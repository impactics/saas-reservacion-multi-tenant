/**
 * POST /api/[slug]/checkout
 *
 * Crea una sesión de pago para un booking PENDING.
 * - Stripe  → devuelve { provider: 'stripe', clientSecret }
 * - MercadoPago → devuelve { provider: 'mercadopago', initPoint }
 *
 * Body esperado:
 *   { bookingId: string }
 *
 * El bookingId se guarda en metadata del pago para que el webhook
 * lo recupere y confirme la reserva automáticamente.
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
    const currency = (booking.service.currency ?? "USD").toLowerCase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const provider = process.env.PAYMENT_PROVIDER ?? "stripe";

    // ── STRIPE ──────────────────────────────────────────────────────────────
    if (provider === "stripe") {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
        apiVersion: "2025-01-27.acacia",
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(price * 100), // centavos
        currency,
        metadata: {
          bookingId: booking.id,
          organizationId: org.id,
          slug,
        },
        description: `${booking.service.name} — ${org.name}`,
        receipt_email: booking.patientEmail ?? undefined,
      });

      // Guardar el paymentId provisional en el booking
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: paymentIntent.id },
      });

      return NextResponse.json({
        provider: "stripe",
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        amount: price,
        currency: currency.toUpperCase(),
      });
    }

    // ── MERCADOPAGO ─────────────────────────────────────────────────────────
    if (provider === "mercadopago") {
      const { MercadoPagoConfig, Preference } = await import("mercadopago");
      const mp = new MercadoPagoConfig({
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
      });

      const preference = await new Preference(mp).create({
        body: {
          items: [
            {
              id: booking.serviceId,
              title: booking.service.name,
              quantity: 1,
              unit_price: price,
              currency_id: currency.toUpperCase(),
            },
          ],
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
          metadata: {
            bookingId: booking.id,
            organizationId: org.id,
          },
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

    return NextResponse.json({ error: "Proveedor de pago no configurado" }, { status: 500 });
  } catch (err) {
    console.error("[checkout] error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
