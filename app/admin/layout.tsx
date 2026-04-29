import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const isSuperAdmin = session.user.isSuperAdmin;

  const orgs = isSuperAdmin
    ? await prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } })
    : [];

  const currentOrgName = isSuperAdmin
    ? "Super Admin"
    : (await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { name: true },
      }))?.name ?? "Mi organización";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-6 px-4 gap-1 shrink-0">

        {/* Identidad */}
        <div className="px-2 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {isSuperAdmin ? "⚡ Super Admin" : "🏥 Admin"}
          </p>
          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{currentOrgName}</p>
          <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
        </div>

        {/* ── SECCIÓN SUPER ADMIN ── */}
        {isSuperAdmin && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Super Admin</p>
            <NavLink href="/super-admin/organizations">🏢 Organizaciones</NavLink>

            {/* Org switcher */}
            {orgs.length > 0 && (
              <div className="mt-2 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Ver como org</p>
                <div className="flex flex-col gap-0.5">
                  {orgs.map((org) => (
                    <a
                      key={org.id}
                      href={`/admin?org=${org.slug}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                      {org.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SECCIÓN PANEL ADMIN ── */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1 mt-2">Panel admin</p>
        <NavLink href="/admin">📅 Citas</NavLink>
        <NavLink href="/admin/services">💊 Servicios</NavLink>
        <NavLink href="/admin/availability">🕐 Disponibilidad</NavLink>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mt-4 mb-1">Configuración</p>
        <NavLink href="/admin/settings">⚙️ General</NavLink>
        <NavLink href="/admin/settings/payments">💳 Pagos y WhatsApp</NavLink>
        <NavLink href="/admin/api-keys">🔑 API Keys</NavLink>

        <div className="mt-auto pt-4 border-t border-gray-100">
          <a
            href="/api/auth/signout"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            🚪 Cerrar sesión
          </a>
        </div>
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
