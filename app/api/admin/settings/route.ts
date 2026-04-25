/**
 * PATCH /api/admin/settings — actualizar configuración de la organización
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  phoneWhatsapp: z.string().optional(),
  timezone: z.string().min(1).optional(),
  whatsappEnabled: z.boolean().optional(),
  googleCalendarEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = SettingsSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(body.data.name && { name: body.data.name }),
      ...(body.data.logoUrl !== undefined && { logoUrl: body.data.logoUrl || null }),
      ...(body.data.phoneWhatsapp !== undefined && { phoneWhatsapp: body.data.phoneWhatsapp }),
      ...(body.data.timezone && { timezone: body.data.timezone }),
      ...(body.data.whatsappEnabled !== undefined && { whatsappEnabled: body.data.whatsappEnabled }),
      ...(body.data.googleCalendarEnabled !== undefined && { googleCalendarEnabled: body.data.googleCalendarEnabled }),
    },
    select: {
      id: true, name: true, slug: true, logoUrl: true,
      phoneWhatsapp: true, timezone: true,
      whatsappEnabled: true, googleCalendarEnabled: true,
    },
  });
  return NextResponse.json(org);
}
