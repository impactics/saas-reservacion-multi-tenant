import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select:  { id: true, slug: true, name: true },
  });
  return NextResponse.json({ orgs });
}
