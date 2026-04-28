/**
 * POST /api/[slug]/checkout
 *
 * Crea una sesión de pago para un booking PENDING.
 *
 * Proveedores soportados (PAYMENT_PROVIDER en .env):
 *   payphone → { provider, paymentUrl, paymentId }
 *   paypal   → { provider, orderId, clientId, amount, currency }
 *
 * Body: { bookingId: string, returnUrl?: string, cancelUrl?: string }
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
    const provider = process.env.PAYMENT_PROVIDER ?? "payphone";

    const returnUrl =
      body.data.returnUrl ??
      `${appUrl}/${slug}/booking/confirmacion?bookingId=${booking.id}`;
    const cancelUrl =
      body.data.cancelUrl ??
      `${appUrl}/${slug}/checkout/${booking.serviceId}?bookingId=${booking.id}&error=cancelled`;

    // ── PAYPHONE ─────────────────────────────────────────────────────────
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

    // ── PAYPAL ──────────────────────────────────────────────────────────────
    if (provider === "paypal") {
      const { createPayPalOrder } = await import("@/lib/paypal");

      const orderId = await createPayPalOrder({
        amount: price,
        currency,
        bookingId: booking.id,
        description: `${booking.service.name} — ${org.name}`,
        brandName: org.name,
        returnUrl,
        cancelUrl,
      });

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
        { error: `Proveedor "${provider}" no soportado. Usa "payphone" o "paypal".` },
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
