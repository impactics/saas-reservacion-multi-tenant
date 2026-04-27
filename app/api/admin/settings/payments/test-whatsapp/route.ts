/**
 * POST /api/admin/settings/payments/test-whatsapp
 * Envía un mensaje de prueba al phoneWhatsapp de la organización
 * usando las credenciales guardadas en la DB.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      wapiToken:          true,
      wapiPhoneNumberId:  true,
      wapiFromNumber:     true,
      phoneWhatsapp:      true,
      name:               true,
    },
  });

  if (!org?.wapiToken || !org?.wapiPhoneNumberId) {
    return NextResponse.json(
      { error: "Configura primero el Token y el Phone Number ID de WhatsApp" },
      { status: 400 },
    );
  }

  const toNumber = org.phoneWhatsapp;
  if (!toNumber) {
    return NextResponse.json(
      { error: "Agrega el número de WhatsApp de la organización en Configuración general" },
      { status: 400 },
    );
  }

  const url = `https://graph.facebook.com/v19.0/${org.wapiPhoneNumberId}/messages`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${org.wapiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to:   toNumber.replace(/\D/g, ""),  // solo dígitos
      type: "text",
      text: {
        body: `✅ Prueba de conexión exitosa para *${org.name}*. Las notificaciones de citas están activas.`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json(
      { error: err?.error?.message ?? "Error al enviar mensaje" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
