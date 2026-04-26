import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const serviceId = req.nextUrl.searchParams.get("serviceId");

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    // Si se pasa serviceId, filtramos los profesionales que ofrecen ese servicio
    const where = serviceId
      ? {
          organizationId: org.id,
          active: true,
          services: { some: { id: serviceId, active: true } },
        }
      : { organizationId: org.id, active: true };

    const professionals = await prisma.professional.findMany({
      where,
      select: {
        id: true,
        name: true,
        specialty: true,
        // avatarUrl no existe en el schema, se omite
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ professionals });
  } catch (err) {
    console.error("[professionals] GET error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
