/**
 * POST /api/admin/availability/blackout — crear fecha bloqueada
 * DELETE /api/admin/availability/blackout?id=xxx — eliminar fecha bloqueada
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const BlackoutSchema = z.object({
  professionalId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = BlackoutSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const prof = await prisma.professional.findFirst({
    where: { id: body.data.professionalId, organizationId: session.user.organizationId },
  });
  if (!prof) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const blackout = await prisma.blackoutDate.create({
    data: {
      organizationId: session.user.organizationId,
      professionalId: body.data.professionalId,
      date: new Date(body.data.date),
      startTime: body.data.startTime ?? null,
      endTime: body.data.endTime ?? null,
      reason: body.data.reason ?? null,
    },
  });
  return NextResponse.json(blackout, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const blackout = await prisma.blackoutDate.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!blackout) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await prisma.blackoutDate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
