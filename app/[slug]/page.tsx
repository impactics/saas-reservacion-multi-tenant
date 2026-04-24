import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { name: true, description: true },
  });
  if (!org) return {};
  return {
    title: org.name,
    description: org.description ?? `Agenda tu cita con ${org.name}`,
  };
}

export default async function TenantHomePage({ params }: Props) {
  const { slug } = await params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      primaryColor: true,
    },
  });
  if (!org) notFound();

  const services = await prisma.service.findMany({
    where: { organizationId: org.id, active: true },
    select: { id: true, name: true, description: true, durationMinutes: true, price: true, currency: true, imageUrl: true },
    orderBy: { name: "asc" },
    take: 6,
  });

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-4">
          {org.logoUrl && (
            <img src={org.logoUrl} alt={org.name} className="h-16 w-auto object-contain" />
          )}
          <h1 className="text-3xl font-bold text-gray-900">{org.name}</h1>
          {org.description && (
            <p className="text-gray-500 max-w-xl">{org.description}</p>
          )}
          <Link
            href={`/${slug}/servicios`}
            className="mt-2 inline-block bg-teal-700 hover:bg-teal-800 text-white font-medium px-8 py-3 rounded-lg transition-colors"
          >
            Agendar cita
          </Link>
        </div>
      </section>

      {/* Servicios destacados */}
      {services.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Nuestros servicios</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((svc) => (
              <Link
                key={svc.id}
                href={`/${slug}/booking?serviceId=${svc.id}`}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
              >
                {svc.imageUrl && (
                  <img src={svc.imageUrl} alt={svc.name} className="h-36 w-full object-cover" />
                )}
                <div className="p-4 flex flex-col gap-1 flex-1">
                  <span className="font-semibold text-gray-900">{svc.name}</span>
                  {svc.description && (
                    <span className="text-sm text-gray-500 line-clamp-2">{svc.description}</span>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <span className="text-sm text-gray-400">{svc.durationMinutes} min</span>
                    {svc.price && (
                      <span className="text-sm font-medium text-teal-700">
                        {Number(svc.price).toLocaleString("es-EC", { style: "currency", currency: svc.currency ?? "USD" })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {services.length === 6 && (
            <div className="mt-6 text-center">
              <Link href={`/${slug}/servicios`} className="text-teal-700 hover:underline text-sm font-medium">
                Ver todos los servicios →
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
