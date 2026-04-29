import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createServiceSchema } from "@/lib/schemas";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const services = await prisma.service.findMany({
    where:   { organizationId: session.user.organizationId },
    include: { professional: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(services);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = createServiceSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  const service = await prisma.service.create({
    data: {
      organizationId:  session.user.organizationId,
      professionalId:  body.data.professionalId,
      name:            body.data.name,
      description:     body.data.description ?? null,
      durationMinutes: body.data.durationMinutes,
      price:           body.data.price,
      currency:        body.data.currency ?? "USD",
    },
  });
  return NextResponse.json(service, { status: 201 });
}
