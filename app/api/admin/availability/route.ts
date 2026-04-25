/**
 * POST /api/admin/availability — crear regla de disponibilidad
 * DELETE /api/admin/availability?ruleId=xxx — desactivar regla
 * POST /api/admin/availability/blackout — crear fecha bloqueada
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const RuleSchema = z.object({
  professionalId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.number().int().min(5).max(120),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = RuleSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  // Verificar que el profesional pertenece a la org
  const prof = await prisma.professional.findFirst({
    where: { id: body.data.professionalId, organizationId: session.user.organizationId },
  });
  if (!prof) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const rule = await prisma.availabilityRule.create({
    data: {
      organizationId: session.user.organizationId,
      professionalId: body.data.professionalId,
      dayOfWeek: body.data.dayOfWeek,
      startTime: body.data.startTime,
      endTime: body.data.endTime,
      slotDurationMinutes: body.data.slotDurationMinutes,
    },
  });
  return NextResponse.json(rule, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ruleId = req.nextUrl.searchParams.get("ruleId");
  if (!ruleId) return NextResponse.json({ error: "ruleId requerido" }, { status: 400 });

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, organizationId: session.user.organizationId },
  });
  if (!rule) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });

  await prisma.availabilityRule.update({ where: { id: ruleId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
