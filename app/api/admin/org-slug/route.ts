import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const orgId = session.user.organizationId;
  if (orgId !== "superadmin" && orgId !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.findUnique({ where: { id }, select: { slug: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ slug: org.slug });
}
