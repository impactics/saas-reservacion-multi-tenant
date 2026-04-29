/**
 * GET /api/admin/org-slug?id=<orgId>
 * Devuelve el slug de una organización dado su id.
 * Usado por la página de API Keys para org admins.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Org admin solo puede ver su propia org
  const orgId = session.user.organizationId;
  if (orgId !== "superadmin" && orgId !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { slug: true },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ slug: org.slug });
}
