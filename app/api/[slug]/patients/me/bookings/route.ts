/**
 * GET /api/{slug}/patients/me/bookings
 *
 * Devuelve las citas del paciente autenticado para la organización.
 * Filtros opcionales por query param:
 *   ?status=CONFIRMED,PENDING,CANCELLED,COMPLETED
 *   ?upcoming=true  (solo citas futuras)
 *
 * Auth: cookie patient_token
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPatientToken, getPatientTokenFromCookie } from "@/lib/patient-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, timezone: true },
  });
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // Auth
  const cookieHeader = req.headers.get("cookie");
  const token = getPatientTokenFromCookie(cookieHeader);
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const payload = await verifyPatientToken(token);
  if (!payload || payload.orgId !== org.id) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  // Filtros
  const searchParams = req.nextUrl.searchParams;
  const statusFilter = searchParams.get("status");
  const upcomingOnly = searchParams.get("upcoming") === "true";

  const statusList = statusFilter
    ? statusFilter.split(",").map((s) => s.trim().toUpperCase())
    : undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      patientId:      payload.patientId,
      organizationId: org.id,
      ...(statusList ? { status: { in: statusList as any } } : {}),
      ...(upcomingOnly ? { scheduledAt: { gte: new Date() } } : {}),
    },
    include: {
      service:      { select: { name: true, price: true, currency: true, imageUrl: true } },
      professional: { select: { name: true, specialty: true } },
      reschedules:  { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ bookings });
}
