import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { updateOrganizationSchema } from "@/lib/schemas";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = updateOrganizationSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data:  body.data,
    select: {
      id: true, name: true, slug: true, logoUrl: true,
      phoneWhatsapp: true, timezone: true,
      whatsappEnabled: true, googleCalendarEnabled: true,
    },
  });
  return NextResponse.json(org);
}
