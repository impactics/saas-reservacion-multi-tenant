/**
 * Lista completa de reservas del admin
 * Filtros: fecha, estado, profesional
 * Acciones: confirmar, cancelar, ver detalle
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
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

  // Construir where dinámico
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId: orgId };
  if (sp.status) where.status = sp.status;
  if (sp.professionalId) where.professionalId = sp.professionalId;
  if (sp.date) {
    const d = new Date(sp.date);
    where.scheduledAt = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lte: new Date(d.setHours(23, 59, 59, 999)),
    };
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
      skip,
      take: PER_PAGE,
    }),
    prisma.booking.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const statusOptions = [
    { value: "", label: "Todos los estados" },
    { value: "PENDING", label: "Pendiente" },
    { value: "CONFIRMED", label: "Confirmada" },
    { value: "CANCELLED", label: "Cancelada" },
    { value: "COMPLETED", label: "Completada" },
    { value: "RESCHEDULED", label: "Reagendada" },
  ];

  const statusMap: Record<string, { label: string; cls: string }> = {
    CONFIRMED: { label: "Confirmada", cls: "bg-teal-50 text-teal-700" },
    PENDING: { label: "Pendiente", cls: "bg-yellow-50 text-yellow-700" },
    CANCELLED: { label: "Cancelada", cls: "bg-red-50 text-red-600" },
    COMPLETED: { label: "Completada", cls: "bg-gray-100 text-gray-600" },
    RESCHEDULED: { label: "Reagendada", cls: "bg-blue-50 text-blue-700" },
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900">Reservas</h1>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3">
        <select name="status" defaultValue={sp.status ?? ""}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="professionalId" defaultValue={sp.professionalId ?? ""}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
          <option value="">Todos los profesionales</option>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" name="date" defaultValue={sp.date ?? ""}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white" />
        <button type="submit"
          className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Filtrar
        </button>
        <a href="/admin/bookings" className="text-sm text-gray-400 hover:text-gray-600 self-center">Limpiar</a>
      </form>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {bookings.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No hay reservas con esos filtros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Paciente</th>
                  <th className="text-left px-4 py-3">Servicio</th>
                  <th className="text-left px-4 py-3">Profesional</th>
                  <th className="text-left px-4 py-3">Fecha y hora</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">Pago</th>
                  <th className="text-left px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((b) => {
                  const local = toZonedTime(b.scheduledAt, tz);
                  const st = statusMap[b.status] ?? { label: b.status, cls: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{b.patientName}</div>
                        <div className="text-xs text-gray-400">{b.patientPhone}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{b.service.name}</td>
                      <td className="px-4 py-3 text-gray-600">{b.professional.name}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-700">
                        <div>{format(local, "d MMM yyyy", { locale: es })}</div>
                        <div className="text-xs text-gray-400">{format(local, "HH:mm")}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          b.paymentStatus === "PAID" ? "bg-teal-50 text-teal-700" :
                          b.paymentStatus === "REFUNDED" ? "bg-orange-50 text-orange-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {b.paymentStatus === "PAID" ? "Pagado" :
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

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Mostrando {skip + 1}–{Math.min(skip + PER_PAGE, total)} de {total}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}&status=${sp.status ?? ""}&professionalId=${sp.professionalId ?? ""}&date=${sp.date ?? ""}`}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">← Anterior</a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}&status=${sp.status ?? ""}&professionalId=${sp.professionalId ?? ""}&date=${sp.date ?? ""}`}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">Siguiente →</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
