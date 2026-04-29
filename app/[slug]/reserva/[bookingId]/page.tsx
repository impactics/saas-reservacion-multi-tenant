import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";
import { CancelButton } from "./cancel-button";

interface Props {
  params: Promise<{ slug: string; bookingId: string }>;
}

export default async function ReservaDetailPage({ params }: Props) {
  const { slug, bookingId } = await params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true },
  });
  if (!org) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: org.id },
    include: {
      service: { select: { name: true, durationMinutes: true, price: true, currency: true } },
      professional: { select: { name: true } },
    },
  });
  if (!booking) notFound();

  const tz = org.timezone ?? "America/Guayaquil";
  const localDate = toZonedTime(booking.startTime, tz);
  const dateStr = format(localDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const timeStr = format(localDate, "HH:mm");
  const isPast = booking.startTime < new Date();
  const isCancelled = booking.status === "CANCELLED";

  const statusLabels: Record<string, { label: string; className: string }> = {
    CONFIRMED: { label: "Confirmada", className: "bg-teal-50 text-teal-700" },
    PENDING: { label: "Pendiente", className: "bg-yellow-50 text-yellow-700" },
    CANCELLED: { label: "Cancelada", className: "bg-red-50 text-red-700" },
    COMPLETED: { label: "Completada", className: "bg-gray-100 text-gray-600" },
  };

  const status = statusLabels[booking.status] ?? { label: booking.status, className: "bg-gray-100 text-gray-600" };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href={`/${slug}`} className="text-sm text-gray-400 hover:text-gray-600">
            ← Inicio
          </Link>
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${status.className}`}>
            {status.label}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-gray-900">Detalle de tu cita</h1>

          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Servicio</span>
              <span className="font-medium">{booking.service.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Profesional</span>
              <span className="font-medium">{booking.professional.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha</span>
              <span className="font-medium capitalize">{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hora</span>
              <span className="font-medium">{timeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duración</span>
              <span className="font-medium">{booking.service.durationMinutes} min</span>
            </div>
            {booking.service.price && (
              <div className="flex justify-between">
                <span className="text-gray-500">Precio</span>
                <span className="font-medium">
                  {Number(booking.service.price).toLocaleString("es-EC", {
                    style: "currency",
                    currency: booking.service.currency ?? "USD",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Acciones — solo si la cita no pasó y no está cancelada */}
        {!isPast && !isCancelled && (
          <div className="flex flex-col gap-3">
            <Link
              href={`/${slug}/booking?reschedule=${booking.id}&serviceId=${booking.serviceId}`}
              className="w-full text-center border border-teal-600 text-teal-700 hover:bg-teal-50 font-medium py-3 rounded-lg transition-colors"
            >
              Reagendar cita
            </Link>
            <CancelButton slug={slug} bookingId={booking.id} />
          </div>
        )}
      </div>
    </main>
  );
}
