/**
 * Layout del panel admin
 * - Auth guard: si no hay sesión, redirect a /login
 * - Sidebar con navegación entre secciones
 * - Server component: lee la sesión vía getServerSession
 */

import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata = { title: "Panel Admin" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin");

  return (
    <div className="min-h-screen flex bg-gray-50">
      <AdminSidebar user={session.user} />
      <main className="flex-1 min-w-0 p-6 lg:p-8">{children}</main>
    </div>
  );
}
