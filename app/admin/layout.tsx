import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata = { title: "Panel Admin — SaaS Reservaciones" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin");

  return (
    <div className="min-h-screen flex bg-gray-50">
      <AdminSidebar user={session.user} />
      {/* pt-14 en mobile para no quedar bajo el top bar */}
      <main className="flex-1 min-w-0 p-4 pt-18 lg:pt-0 lg:p-8">{children}</main>
    </div>
  );
}
