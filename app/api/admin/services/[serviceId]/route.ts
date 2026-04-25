/**
 * PATCH /api/admin/services/[serviceId] — actualizar servicio
 * DELETE /api/admin/services/[serviceId] — desactivar servicio (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  active: z.boolean().optional(),
});

async function getOrgService(session: Awaited<ReturnType<typeof getServerSession>>, serviceId: string) {
  if (!session?.user?.organizationId) return null;
  return prisma.service.findFirst({
    where: { id: serviceId, organizationId: session.user.organizationId },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { serviceId } = await params;
  const service = await getOrgService(session, serviceId);
  if (!service) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = UpdateSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: body.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const session = await getServerSession(authOptions);
  const { serviceId } = await params;
  const service = await getOrgService(session, serviceId);
  if (!service) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await prisma.service.update({ where: { id: serviceId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
