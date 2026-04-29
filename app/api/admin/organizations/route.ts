/**
 * GET /api/admin/organizations
 * Devuelve todas las organizaciones (solo accesible para superadmin).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSuperAdmin = (session.user as { isSuperAdmin?: boolean }).isSuperAdmin;
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });

  return NextResponse.json({ orgs });
}
