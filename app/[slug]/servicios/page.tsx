import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ServiciosPage({ params }: Props) {
  const { slug } = await params;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!org) notFound();

  const services = await prisma.service.findMany({
    where: { organizationId: org.id, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      price: true,
      currency: true,
      imageUrl: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/${slug}`} className="flex items-center gap-3">
            {org.logoUrl && (
              <img src={org.logoUrl} alt={org.name} className="h-8 w-auto" />
            )}
            <span className="font-semibold text-gray-900">{org.name}</span>
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Elige un servicio</h1>

        {services.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No hay servicios disponibles por el momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.map((svc) => (
              <Link
                key={svc.id}
                href={`/${slug}/booking?serviceId=${svc.id}`}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-teal-300 transition-all flex flex-col"
              >
                {svc.imageUrl && (
                  <img src={svc.imageUrl} alt={svc.name} className="h-40 w-full object-cover" />
                )}
                <div className="p-5 flex flex-col gap-2 flex-1">
                  <span className="font-semibold text-gray-900 text-lg">{svc.name}</span>
                  {svc.description && (
                    <span className="text-sm text-gray-500">{svc.description}</span>
                  )}
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2"/>
                      </svg>
                      {svc.durationMinutes} min
                    </span>
                    {svc.price && (
                      <span className="font-semibold text-teal-700">
                        {Number(svc.price).toLocaleString("es-EC", { style: "currency", currency: svc.currency ?? "USD" })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
