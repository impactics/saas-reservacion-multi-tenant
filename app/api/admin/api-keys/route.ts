import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/apiKey";

// GET /api/admin/api-keys?slug=dra-maria-belen
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug requerido" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organizacion no encontrada" }, { status: 404 });

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, keyPrefix: true,
      allowedOrigins: true, active: true,
      lastUsedAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ keys });
}

// POST /api/admin/api-keys — crear nueva key
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { slug, name, allowedOrigins } = await req.json();
  if (!slug || !name) return NextResponse.json({ error: "slug y name requeridos" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organizacion no encontrada" }, { status: 404 });

  const { raw, prefix, hash } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      allowedOrigins: allowedOrigins ?? [],
    },
  });

  // La clave se retorna en claro SOLO esta vez
  return NextResponse.json({ key: raw, prefix }, { status: 201 });
}

// DELETE /api/admin/api-keys?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.apiKey.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
