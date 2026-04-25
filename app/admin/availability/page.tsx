/**
 * Gestión de disponibilidad por profesional
 * - Reglas semanales (día, hora inicio/fin, duración de slot)
 * - Fechas bloqueadas (blackout dates)
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AvailabilityForm from "@/components/admin/AvailabilityForm";

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export default async function AdminAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ professionalId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;
  const sp = await searchParams;

  const professionals = await prisma.professional.findMany({
    where: { organizationId: orgId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const selectedId = sp.professionalId ?? professionals[0]?.id;

  const [rules, blackouts] = selectedId
    ? await Promise.all([
        prisma.availabilityRule.findMany({
          where: { professionalId: selectedId, active: true },
          orderBy: { dayOfWeek: "asc" },
        }),
        prisma.blackoutDate.findMany({
          where: { professionalId: selectedId, date: { gte: new Date() } },
          orderBy: { date: "asc" },
          take: 20,
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900">Disponibilidad</h1>

      {/* Selector de profesional */}
      <form className="flex gap-3">
        <select name="professionalId" defaultValue={selectedId}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          onChange={undefined}>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit"
          className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Ver
        </button>
      </form>

      {selectedId && (
        <AvailabilityForm
          professionalId={selectedId}
          rules={rules.map(r => ({ ...r, slotDurationMinutes: r.slotDurationMinutes }))}
          blackouts={blackouts.map(b => ({ ...b, date: b.date.toISOString() }))}
          days={DAYS}
        />
      )}
    </div>
  );
}
