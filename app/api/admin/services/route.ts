/**
 * GET  /api/admin/services — listar servicios de la org
 * POST /api/admin/services — crear nuevo servicio
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  professionalId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  price: z.number().min(0),
  currency: z.string().length(3).default("USD"),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const services = await prisma.service.findMany({
    where: { organizationId: session.user.organizationId },
    include: { professional: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(services);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  const service = await prisma.service.create({
    data: {
      organizationId: session.user.organizationId,
      professionalId: body.data.professionalId,
      name: body.data.name,
      description: body.data.description ?? null,
      durationMinutes: body.data.durationMinutes,
      price: body.data.price,
      currency: body.data.currency,
    },
  });
  return NextResponse.json(service, { status: 201 });
}
