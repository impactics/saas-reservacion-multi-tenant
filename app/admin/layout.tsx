import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-6 px-4 gap-1 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Panel admin</p>

        <NavLink href="/admin">🗓 Citas</NavLink>
        <NavLink href="/admin/services">💊 Servicios</NavLink>
        <NavLink href="/admin/availability">🕐 Disponibilidad</NavLink>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mt-4 mb-1">Configuración</p>
        <NavLink href="/admin/settings">⚙️ General</NavLink>
        <NavLink href="/admin/settings/payments">💳 Pagos y WhatsApp</NavLink>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
    >
      {children}
    </Link>
  );
}
