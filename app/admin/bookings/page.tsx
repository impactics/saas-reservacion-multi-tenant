/**
 * Lista de reservas — Admin
 */
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { format, differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import BookingActions from "@/components/admin/BookingActions";

interface SearchParams {
  status?: string;
  professionalId?: string;
  date?: string;
  page?: string;
}

const PER_PAGE = 20;

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const skip = (page - 1) * PER_PAGE;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  const tz = org?.timezone ?? "America/Guayaquil";

  const professionals = await prisma.professional.findMany({
    where: { organizationId: orgId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId: orgId };
  if (sp.status) where.status = sp.status;
  if (sp.professionalId) where.professionalId = sp.professionalId;
  if (sp.date) {
    const d = new Date(sp.date);
    where.startTime = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lte: new Date(d.setHours(23, 59, 59, 999)),
    };
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        service: { select: { name: true, durationMinutes: true } },
        professional: { select: { name: true } },
      },
      orderBy: { startTime: "desc" },
      skip,
      take: PER_PAGE,
    }),
    prisma.booking.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const statusOptions = [
    { value: "", label: "Todos los estados" },
    { value: "PENDING",     label: "\u23f3 Pendiente" },
    { value: "CONFIRMED",   label: "\u2705 Confirmada" },
    { value: "CANCELLED",   label: "\u274c Cancelada" },
    { value: "COMPLETED",   label: "\u2713 Completada" },
    { value: "NO_SHOW",     label: "\ud83d\udeab No se present\u00f3" },
  ];

  const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
    CONFIRMED: { label: "Confirmada",      cls: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",    dot: "bg-teal-500" },
    PENDING:   { label: "Pendiente",       cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", dot: "bg-amber-400" },
    CANCELLED: { label: "Cancelada",       cls: "bg-red-50 text-red-600 ring-1 ring-red-200",       dot: "bg-red-500" },
    COMPLETED: { label: "Completada",      cls: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",   dot: "bg-gray-400" },
    NO_SHOW:   { label: "No se present\u00f3", cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", dot: "bg-orange-400" },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reservas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} reservas en total</p>
        </div>
      </div>

      {/* Filtros */}
      <form className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
          <select name="status" defaultValue={sp.status ?? ""}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white min-w-[160px]">
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Profesional</label>
          <select name="professionalId" defaultValue={sp.professionalId ?? ""}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white min-w-[180px]">
            <option value="">Todos</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</label>
          <input type="date" name="date" defaultValue={sp.date ?? ""}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white" />
        </div>
        <button type="submit"
          className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
          Filtrar
        </button>
        {(sp.status || sp.professionalId || sp.date) && (
          <a href="/admin/bookings"
            className="text-sm text-gray-400 hover:text-gray-600 py-2 underline-offset-2 hover:underline">
            Limpiar filtros
          </a>
        )}
      </form>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {bookings.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-4xl mb-3">\ud83d\udcc5</div>
            <p className="text-gray-500 font-medium">No hay reservas con esos filtros</p>
            <p className="text-gray-400 text-sm mt-1">Intenta cambiar los filtros o limpia la b\u00fasqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Profesional</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha y hora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duraci\u00f3n</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((b) => {
                  const local = toZonedTime(b.startTime, tz);
                  const duration = differenceInMinutes(b.endTime, b.startTime);
                  const st = statusMap[b.status] ?? { label: b.status, cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{b.patientName}</div>
                        {b.patientPhone && <div className="text-xs text-gray-400 mt-0.5">{b.patientPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{b.service.name}</td>
                      <td className="px-4 py-3 text-gray-700">{b.professional.name}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <div className="font-medium text-gray-900">{format(local, "d MMM yyyy", { locale: es })}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{format(local, "HH:mm")}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{duration} min</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          b.paymentStatus === "PAID"     ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200" :
                          b.paymentStatus === "REFUNDED" ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200" :
                          "bg-gray-100 text-gray-400"
                        }`}>
                          {b.paymentStatus === "PAID"     ? "\u2714 Pagado" :
                           b.paymentStatus === "REFUNDED" ? "Reembolsado" : "Sin pago"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <BookingActions bookingId={b.id} status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginaci\u00f3n */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Mostrando {skip + 1}\u2013{Math.min(skip + PER_PAGE, total)} de {total}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}&status=${sp.status ?? ""}&professionalId=${sp.professionalId ?? ""}&date=${sp.date ?? ""}`}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">\u2190 Anterior</a>
            )}
            <span className="px-3 py-1.5 bg-teal-700 text-white rounded-lg">{page}</span>
            {page < totalPages && (
              <a href={`?page=${page + 1}&status=${sp.status ?? ""}&professionalId=${sp.professionalId ?? ""}&date=${sp.date ?? ""}`}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Siguiente \u2192</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
