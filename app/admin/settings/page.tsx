/**
 * Configuración de la organización
 * - Nombre, logo, timezone, WhatsApp, Google Calendar
 *
 * Superadmin: debe seleccionar una org desde el sidebar antes de entrar aquí.
 * Si llega con organizationId='superadmin' se muestra un aviso.
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrgSettingsForm from "@/components/admin/OrgSettingsForm";
import Link from "next/link";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const orgId = session.user.organizationId;

  // Superadmin sin org seleccionada
  if (orgId === "superadmin") {
    return (
      <div className="flex flex-col gap-4 max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Selecciona una organización primero</p>
          <p className="text-sm text-amber-700">
            Como Super Admin debes elegir la organización que quieres configurar desde el panel izquierdo.
          </p>
          <Link href="/admin" className="mt-3 inline-block text-sm text-teal-700 underline hover:text-teal-900">
            ← Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

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
