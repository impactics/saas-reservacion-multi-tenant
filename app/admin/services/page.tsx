/**
 * Gestión de servicios
 * - Listar, crear, editar, desactivar servicios
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ServicesManager from "@/components/admin/ServicesManager";

export default async function AdminServicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;

  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId: orgId },
      include: { professional: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.professional.findMany({
      where: { organizationId: orgId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Servicios</h1>
      </div>
      <ServicesManager
        orgId={orgId}
        services={services.map(s => ({
          ...s,
          price: Number(s.price),
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          professionalName: s.professional.name,
        }))}
        professionals={professionals}
      />
    </div>
  );
}
