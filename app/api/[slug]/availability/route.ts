import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyApiKey } from "@/lib/apiKey";
import { withCors } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const origin = req.headers.get("origin");
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  let allowedOrigins: string[] = ["*"];

  if (apiKey) {
    const verified = await verifyApiKey(apiKey, origin);
    if (!verified || verified.slug !== params.slug) {
      return withCors(
        NextResponse.json({ error: "API key invalida" }, { status: 401 }),
        origin
      );
    }
  }

  const { searchParams } = req.nextUrl;
  const professionalId = searchParams.get("professionalId");
  const date = searchParams.get("date");

  if (!professionalId || !date) {
    return withCors(
      NextResponse.json({ error: "professionalId y date son requeridos" }, { status: 400 }),
      origin,
      allowedOrigins
    );
  }

  const org = await prisma.organization.findUnique({
    where: { slug: params.slug },
    select: { id: true, timezone: true },
  });
  if (!org) {
    return withCors(
      NextResponse.json({ error: "Organizacion no encontrada" }, { status: 404 }),
      origin,
      allowedOrigins
    );
  }

  const [year, month, day] = date.split("-").map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();

  const rules = await prisma.availabilityRule.findMany({
    where: { professionalId, dayOfWeek, active: true },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      professionalId,
      scheduledAt: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lt:  new Date(`${date}T23:59:59.999Z`),
      },
      status: { notIn: ["CANCELLED"] },
    },
    select: { scheduledAt: true, durationMinutes: true },
  });

  const slots: { start: string; localStart: string; localEnd: string }[] = [];

  for (const rule of rules) {
    const [sh, sm] = rule.startTime.split(":").map(Number);
    const [eh, em] = rule.endTime.split(":").map(Number);
    let cursor = sh * 60 + sm;
    const end = eh * 60 + em;

    while (cursor + rule.slotDurationMinutes <= end) {
      const slotStart = new Date(
        `${date}T${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}:00.000Z`
      );
      const slotEnd = new Date(slotStart.getTime() + rule.slotDurationMinutes * 60000);

      const isTaken = bookings.some((b) => {
        const bs = b.scheduledAt.getTime();
        const be = bs + b.durationMinutes * 60000;
        const ss = slotStart.getTime();
        const se = slotEnd.getTime();
        return ss < be && se > bs;
      });

      if (!isTaken && slotStart > new Date()) {
        slots.push({
          start: slotStart.toISOString(),
          localStart: slotStart.toLocaleTimeString("es-EC", {
            hour: "2-digit", minute: "2-digit", timeZone: org.timezone,
          }),
          localEnd: slotEnd.toLocaleTimeString("es-EC", {
            hour: "2-digit", minute: "2-digit", timeZone: org.timezone,
          }),
        });
      }
      cursor += rule.slotDurationMinutes;
    }
  }

  return withCors(NextResponse.json({ slots }), origin, allowedOrigins);
}
