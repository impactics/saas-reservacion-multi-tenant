import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCache } from "@/lib/redis";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    }

    // Cache 5 minutos — los servicios cambian poco
    const services = await withCache(
      `services:${org.id}`,
      300,
      () =>
        prisma.service.findMany({
          where: { organizationId: org.id, active: true },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
            currency: true,
            imageUrl: true,
          },
          orderBy: { name: "asc" },
        })
    );

    return NextResponse.json({ services });
  } catch (err) {
    console.error("[services] GET error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
