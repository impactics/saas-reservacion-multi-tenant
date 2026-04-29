import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
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
        where: { organizationId: orgId, startTime: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.booking.count({
        where: { organizationId: orgId, startTime: { gte: weekStart, lte: weekEnd } },
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
          startTime: { gte: nowLocal, lte: next24h },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: {
          service: { select: { name: true } },
          professional: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
        take: 10,
      }),
    ]);

  const kpis = [
    {
      label: "Citas hoy",
      value: bookingsToday,
      color: "text-teal-700",
      bg: "bg-teal-50",
      border: "border-teal-100",
      icon: "\ud83d\udcc5",
      href: "/admin/bookings",
    },
    {
      label: "Esta semana",
      value: bookingsWeek,
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-100",
      icon: "\ud83d\udcc6",
      href: "/admin/bookings",
    },
    {
      label: "Pendientes de confirmar",
      value: bookingsPending,
      color: bookingsPending > 0 ? "text-amber-700" : "text-gray-500",
      bg: bookingsPending > 0 ? "bg-amber-50" : "bg-gray-50",
      border: bookingsPending > 0 ? "border-amber-100" : "border-gray-100",
      icon: "\u23f3",
      href: "/admin/bookings?status=PENDING",
    },
    {
      label: "Completadas",
      value: bookingsCompleted,
      color: "text-gray-600",
      bg: "bg-gray-50",
      border: "border-gray-100",
      icon: "\u2713",
      href: "/admin/bookings?status=COMPLETED",
    },
  ];

  const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
    CONFIRMED: { label: "Confirmada", cls: "bg-teal-50 text-teal-700",   dot: "bg-teal-500" },
    PENDING:   { label: "Pendiente",  cls: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{org?.name} \u00b7 {format(nowLocal, "EEEE d 'de' MMMM", { locale: es })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}
            className={`rounded-xl p-5 flex flex-col gap-2 border ${k.bg} ${k.border} hover:shadow-sm transition-shadow`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-tight">{k.label}</span>
              <span className="text-lg">{k.icon}</span>
            </div>
            <span className={`text-3xl font-bold tabular-nums ${k.color}`}>{k.value}</span>
          </Link>
        ))}
      </div>

      {/* Pr\u00f3ximas 24h */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Pr\u00f3ximas citas</h2>
            <p className="text-xs text-gray-400 mt-0.5">Pr\u00f3ximas 24 horas</p>
          </div>
          <Link href="/admin/bookings" className="text-sm text-teal-700 hover:underline font-medium">Ver todas \u2192</Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">\u2705</div>
            <p className="text-gray-500 font-medium">Todo al d\u00eda</p>
            <p className="text-gray-400 text-sm mt-1">No hay citas pendientes en las pr\u00f3ximas 24 horas</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Profesional</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingBookings.map((b) => {
                  const local = toZonedTime(b.startTime, tz);
                  const st = statusMap[b.status] ?? { label: b.status, cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 tabular-nums">
                        <span className="font-semibold text-gray-900 text-base">{format(local, "HH:mm")}</span>
                        <div className="text-xs text-gray-400">{format(local, "EEE d MMM", { locale: es })}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{b.patientName}</td>
                      <td className="px-4 py-3 text-gray-600">{b.service.name}</td>
                      <td className="px-4 py-3 text-gray-600">{b.professional.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
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
