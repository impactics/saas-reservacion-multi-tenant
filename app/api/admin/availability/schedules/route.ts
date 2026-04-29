/**
 * /api/admin/availability/schedules
 *
 * GET    ?professionalId=xxx  — listar plantillas del profesional
 * POST                         — crear plantilla
 * PATCH                        — actualizar (ej: cambiar isDefault)
 * DELETE ?id=xxx               — eliminar plantilla y sus reglas
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  professionalId: z.string().min(1),
  name:           z.string().min(1).max(100),
  scheduleType:   z.enum(["NORMAL", "HOLIDAY", "VACATION", "CUSTOM"]).default("NORMAL"),
  isDefault:      z.boolean().default(false),
  validFrom:      z.string().optional().nullable(),
  validTo:        z.string().optional().nullable(),
});

const PatchSchema = z.object({
  id:             z.string().min(1),
  professionalId: z.string().min(1),
  isDefault:      z.boolean().optional(),
  active:         z.boolean().optional(),
  name:           z.string().min(1).optional(),
  validFrom:      z.string().optional().nullable(),
  validTo:        z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const professionalId = req.nextUrl.searchParams.get("professionalId");
  if (!professionalId) return NextResponse.json({ error: "professionalId requerido" }, { status: 400 });

  const schedules = await prisma.availabilitySchedule.findMany({
    where: { professionalId },
    orderBy: { createdAt: "asc" },
    include: {
      availabilityRules: { where: { active: true }, orderBy: { dayOfWeek: "asc" } },
    },
  });

  return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = CreateSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos", issues: body.error.issues }, { status: 400 });

  const orgId = session.user.organizationId === "superadmin"
    ? (await prisma.professional.findUnique({ where: { id: body.data.professionalId }, select: { organizationId: true } }))?.organizationId ?? ""
    : session.user.organizationId;

  const prof = await prisma.professional.findFirst({
    where: { id: body.data.professionalId, organizationId: orgId },
  });
  if (!prof) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  // Si isDefault=true, quitar el default de las demás
  if (body.data.isDefault) {
    await prisma.availabilitySchedule.updateMany({
      where: { professionalId: body.data.professionalId },
      data:  { isDefault: false },
    });
  }

  const schedule = await prisma.availabilitySchedule.create({
    data: {
      organizationId: orgId,
      professionalId: body.data.professionalId,
      name:           body.data.name,
      scheduleType:   body.data.scheduleType,
      isDefault:      body.data.isDefault,
      validFrom:      body.data.validFrom ? new Date(body.data.validFrom) : null,
      validTo:        body.data.validTo   ? new Date(body.data.validTo)   : null,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  // Si se marca como default, quitar a los demás
  if (body.data.isDefault) {
    await prisma.availabilitySchedule.updateMany({
      where: { professionalId: body.data.professionalId },
      data:  { isDefault: false },
    });
  }

  const updated = await prisma.availabilitySchedule.update({
    where: { id: body.data.id },
    data: {
      ...(body.data.isDefault !== undefined && { isDefault: body.data.isDefault }),
      ...(body.data.active    !== undefined && { active:    body.data.active }),
      ...(body.data.name      !== undefined && { name:      body.data.name }),
      ...(body.data.validFrom !== undefined && { validFrom: body.data.validFrom ? new Date(body.data.validFrom) : null }),
      ...(body.data.validTo   !== undefined && { validTo:   body.data.validTo   ? new Date(body.data.validTo)   : null }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  // Desactivar reglas asociadas
  await prisma.availabilityRule.updateMany({
    where: { scheduleId: id },
    data:  { active: false },
  });

  await prisma.availabilitySchedule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
