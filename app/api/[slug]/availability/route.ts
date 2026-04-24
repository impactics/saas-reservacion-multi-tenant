import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/availability";
import { z } from "zod";

const QuerySchema = z.object({
  professionalId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);

    const parsed = QuerySchema.safeParse({
      professionalId: searchParams.get("professionalId"),
      date: searchParams.get("date"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 404 }
      );
    }

    const slots = await getAvailableSlots(
      parsed.data.professionalId,
      parsed.data.date,
      org.id
    );

    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[availability] GET error", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
