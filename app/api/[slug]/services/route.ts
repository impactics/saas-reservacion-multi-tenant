import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiKey } from "@/lib/apiKey";
import { withCors, corsOptions } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = req.headers.get("origin");
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  let allowedOrigins: string[] = ["*"];

  if (apiKey) {
    const verified = await verifyApiKey(apiKey, origin);
    if (!verified || verified.slug !== slug) {
      return withCors(
        NextResponse.json({ error: "API key invalida" }, { status: 401 }),
        origin
      );
    }
    const key = await prisma.apiKey.findFirst({
      where: { organization: { slug }, active: true },
      select: { allowedOrigins: true },
    });
    allowedOrigins = key?.allowedOrigins?.length ? key.allowedOrigins : ["*"];
  }

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!org) {
    return withCors(
      NextResponse.json({ error: "Organizacion no encontrada" }, { status: 404 }),
      origin,
      allowedOrigins
    );
  }

  const services = await prisma.service.findMany({
    where: { organizationId: org.id, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      durationMinutes: true,
      price: true,
      currency: true,
    },
  });

  return withCors(
    NextResponse.json({
      services: services.map((s) => ({ ...s, price: Number(s.price) })),
    }),
    origin,
    allowedOrigins
  );
}
