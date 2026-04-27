/**
 * PATCH /api/admin/settings/payments
 * Guarda las credenciales de Payphone y WhatsApp de la organización.
 * Solo el admin autenticado puede modificar su propia org.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const {
    payphoneEnabled,
    payphoneStoreId,
    payphoneToken,     // undefined = no cambiar
    wapiPhoneNumberId,
    wapiFromNumber,
    wapiToken,         // undefined = no cambiar
  } = body;

  const data: Record<string, unknown> = {};

  if (typeof payphoneEnabled   === "boolean") data.payphoneEnabled   = payphoneEnabled;
  if (typeof payphoneStoreId   === "string")  data.payphoneStoreId   = payphoneStoreId.trim();
  if (typeof payphoneToken     === "string" && payphoneToken.trim())
    data.payphoneToken = payphoneToken.trim();

  if (typeof wapiPhoneNumberId === "string")  data.wapiPhoneNumberId = wapiPhoneNumberId.trim();
  if (typeof wapiFromNumber    === "string")  data.wapiFromNumber    = wapiFromNumber.trim();
  if (typeof wapiToken         === "string" && wapiToken.trim())
    data.wapiToken = wapiToken.trim();

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data,
  });

  return NextResponse.json({ ok: true });
}
