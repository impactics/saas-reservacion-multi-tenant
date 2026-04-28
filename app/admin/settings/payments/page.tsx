/**
 * /admin/settings/payments
 *
 * Configuración de métodos de pago y WhatsApp por organización.
 * Solo el admin de la organización puede ver/editar sus propias credenciales.
 * Los tokens se muestran ofuscados (••••) tras guardar.
 */

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PaymentSettingsForm from "@/components/admin/PaymentSettingsForm";

export default async function PaymentSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      id:                 true,
      payphoneEnabled:    true,
      payphoneStoreId:    true,
      wapiPhoneNumberId:  true,
      wapiFromNumber:     true,
    },
  });

  if (!org) redirect("/login");

  // Verificar si los tokens están configurados (sin exponerlos al cliente)
  const raw = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { payphoneToken: true, wapiToken: true },
  });

  const initialData = {
    id:                org.id,
    payphoneEnabled:   org.payphoneEnabled,
    payphoneStoreId:   org.payphoneStoreId ?? "",
    payphoneTokenSet:  !!raw?.payphoneToken,
    wapiPhoneNumberId: org.wapiPhoneNumberId ?? "",
    wapiFromNumber:    org.wapiFromNumber ?? "",
    wapiTokenSet:      !!raw?.wapiToken,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración de pagos</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configura las credenciales de Payphone y WhatsApp para esta organización.
          Las claves secretas se guardan cifradas y nunca se muestran completas.
        </p>
      </div>
      <PaymentSettingsForm initialData={initialData} />
    </div>
  );
}
