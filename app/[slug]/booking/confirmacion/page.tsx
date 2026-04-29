import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ bookingId?: string }>;
}

export default async function ConfirmacionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { bookingId } = await searchParams;

  if (!bookingId) notFound();

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, logoUrl: true },
  });
  if (!org) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId: org.id },
    include: {
      service: { select: { name: true, durationMinutes: true } },
      professional: { select: { name: true } },
    },
  });
  if (!booking) notFound();

  const tz = org.timezone ?? "America/Guayaquil";
  const localDate = toZonedTime(booking.startTime, tz);
  const dateStr = format(localDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const timeStr = format(localDate, "HH:mm");

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md w-full p-8 flex flex-col items-center gap-6">
        {/* Check icon */}
        <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-1">¡Cita confirmada!</h1>
          <p className="text-gray-500 text-sm">Recibirás un mensaje de WhatsApp con los detalles.</p>
        </div>

        {/* Detalles */}
        <div className="w-full bg-gray-50 rounded-xl p-4 flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Servicio</span>
            <span className="font-medium text-gray-900">{booking.service.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Profesional</span>
            <span className="font-medium text-gray-900">{booking.professional.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha</span>
            <span className="font-medium text-gray-900 capitalize">{dateStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Hora</span>
            <span className="font-medium text-gray-900">{timeStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Paciente</span>
            <span className="font-medium text-gray-900">{booking.patientName}</span>
          </div>
        </div>

        <div className="flex flex-col w-full gap-2">
          <Link
            href={`/${slug}/reserva/${booking.id}`}
            className="w-full text-center bg-teal-700 hover:bg-teal-800 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Gestionar cita
          </Link>
          <Link
            href={`/${slug}`}
            className="w-full text-center text-gray-500 hover:text-gray-700 text-sm py-2"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
