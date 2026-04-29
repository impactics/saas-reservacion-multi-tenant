import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, createdAt: true, _count: { select: { professionals: true, bookings: true } } },
  });
  return NextResponse.json({ orgs });
}

const createSchema = z.object({
  name: z.string().min(2, "Nombre requerido (mín. 2 caracteres)"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  timezone: z.string().default("America/Guayaquil"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  // Zod v4: .issues en lugar de .errors
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const { name, slug, timezone } = parsed.data;

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });

  const org = await prisma.organization.create({
    data: { name, slug, timezone },
    select: { id: true, slug: true, name: true },
  });

  return NextResponse.json({ org }, { status: 201 });
}
