/**
 * Configuración de la organización
 * - Nombre, logo, timezone, WhatsApp, Google Calendar
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrgSettingsForm from "@/components/admin/OrgSettingsForm";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      phoneWhatsapp: true,
      timezone: true,
      whatsappEnabled: true,
      googleCalendarEnabled: true,
    },
  });

  if (!org) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
      <OrgSettingsForm org={org} />
    </div>
  );
}
