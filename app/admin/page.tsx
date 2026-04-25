/**
 * Dashboard principal del admin
 * KPIs: reservas hoy, esta semana, pendientes, completadas
 * Lista de próximas reservas (próximas 24h)
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { startOfDay, endOfDay, addDays, startOfWeek, endOfWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, timezone: true },
  });

  const tz = org?.timezone ?? "America/Guayaquil";
  const nowLocal = toZonedTime(new Date(), tz);
  const todayStart = startOfDay(nowLocal);
  const todayEnd = endOfDay(nowLocal);
  const weekStart = startOfWeek(nowLocal, { locale: es });
  const weekEnd = endOfWeek(nowLocal, { locale: es });
  const next24h = addDays(nowLocal, 1);

  const [bookingsToday, bookingsWeek, bookingsPending, bookingsCompleted, upcomingBookings] =
    await Promise.all([
      prisma.booking.count({
        where: { organizationId: orgId, scheduledAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, scheduledAt: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, status: "PENDING" },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, status: "COMPLETED" },
      }),
      prisma.booking.findMany({
        where: {
          organizationId: orgId,
          scheduledAt: { gte: nowLocal, lte: next24h },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: {
          service: { select: { name: true } },
          professional: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
    ]);

  const kpis = [
    { label: "Citas hoy", value: bookingsToday, color: "text-teal-700", bg: "bg-teal-50" },
    { label: "Esta semana", value: bookingsWeek, color: "text-blue-700", bg: "bg-blue-50" },
    { label: "Pendientes", value: bookingsPending, color: "text-yellow-700", bg: "bg-yellow-50" },
    { label: "Completadas", value: bookingsCompleted, color: "text-gray-600", bg: "bg-gray-100" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{org?.name}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl p-5 flex flex-col gap-1 ${k.bg}`}>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{k.label}</span>
            <span className={`text-3xl font-bold tabular-nums ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* Próximas 24h */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Próximas 24 horas</h2>
          <Link href="/admin/bookings" className="text-sm text-teal-700 hover:underline">Ver todas →</Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            No hay citas en las próximas 24 horas
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Paciente</th>
                  <th className="text-left px-4 py-3">Servicio</th>
                  <th className="text-left px-4 py-3">Profesional</th>
                  <th className="text-left px-4 py-3">Hora</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingBookings.map((b) => {
                  const local = toZonedTime(b.scheduledAt, tz);
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    CONFIRMED: { label: "Confirmada", cls: "bg-teal-50 text-teal-700" },
                    PENDING: { label: "Pendiente", cls: "bg-yellow-50 text-yellow-700" },
                  };
                  const st = statusMap[b.status] ?? { label: b.status, cls: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.patientName}</td>
                      <td className="px-4 py-3 text-gray-600">{b.service.name}</td>
                      <td className="px-4 py-3 text-gray-600">{b.professional.name}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">
                        {format(local, "HH:mm")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
