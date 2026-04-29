/**
 * Para superadmin: resuelve el orgId real desde la cookie `sa-org`.
 * Para org-admin:  devuelve directo el organizationId de la sesión.
 */
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function resolveOrgId(
  isSuperAdmin: boolean,
  orgIdFromSession: string
): Promise<string> {
  if (!isSuperAdmin) return orgIdFromSession;

  const cookieStore = await cookies();
  const slug = cookieStore.get("sa-org")?.value;
  if (!slug) return "superadmin"; // sin org seleccionada

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return org?.id ?? "superadmin";
}
