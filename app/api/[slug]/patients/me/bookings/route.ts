/**
 * GET /api/{slug}/patients/me/bookings
 *
 * Devuelve las citas del paciente autenticado.
 * Filtros: ?status=CONFIRMED,PENDING,... | ?upcoming=true
 *
 * Auth: cookie patient_token
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPatientToken, getPatientTokenFromCookie } from "@/lib/patient-auth";
import { differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const org = await prisma.organization.findUnique({
    where:  { slug },
    select: { id: true, timezone: true },
  });
  if (!org) return NextResponse.json({ error: "Organizaci\u00f3n no encontrada" }, { status: 404 });

  const token = getPatientTokenFromCookie(req.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const payload = await verifyPatientToken(token);
  if (!payload || payload.orgId !== org.id)
    return NextResponse.json({ error: "Token inv\u00e1lido" }, { status: 401 });

  const searchParams  = req.nextUrl.searchParams;
  const statusFilter  = searchParams.get("status");
  const upcomingOnly  = searchParams.get("upcoming") === "true";

  const statusList = statusFilter
    ? statusFilter.split(",").map((s) => s.trim().toUpperCase())
    : undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      patientId:      payload.patientId,
      organizationId: org.id,
      ...(statusList ? { status: { in: statusList as never[] } } : {}),
      // upcoming: citas cuyo startTime >= ahora
      ...(upcomingOnly ? { startTime: { gte: new Date() } } : {}),
    },
    include: {
      service:      { select: { name: true, price: true, currency: true, imageUrl: true, durationMinutes: true } },
      professional: { select: { name: true, specialty: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const tz = org.timezone ?? "America/Guayaquil";

  // Enriquecer con campos calculados para el cliente
  const enriched = bookings.map((b) => ({
    ...b,
    durationMinutes:  differenceInMinutes(b.endTime, b.startTime),
    localStartTime:   toZonedTime(b.startTime, tz).toISOString(),
    localEndTime:     toZonedTime(b.endTime,   tz).toISOString(),
    rescheduleCount:  b.rescheduleCount,
  }));

  return NextResponse.json({ bookings: enriched });
}
