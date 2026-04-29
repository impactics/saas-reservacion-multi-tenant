import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // select explícito para no leer columnas que aún no existen en la DB
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // Prisma emite DELETE FROM organizations WHERE id = ? — el cascade lo maneja la DB
  await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
