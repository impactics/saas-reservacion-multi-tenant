import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { selectOrg } from "@/app/actions/select-org";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) redirect("/login");

  const isSuperAdmin = session.user.isSuperAdmin;

  const orgs = isSuperAdmin
    ? await prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } })
    : [];

  // Org actualmente seleccionada por el superadmin
  const cookieStore = await cookies();
  const selectedSlug = isSuperAdmin ? (cookieStore.get("sa-org")?.value ?? null) : null;
  const selectedOrg = selectedSlug ? orgs.find((o) => o.slug === selectedSlug) : null;

  const currentOrgName = isSuperAdmin
    ? (selectedOrg?.name ?? "Super Admin")
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

            {/* Org switcher — form con server action para setear cookie */}
            {orgs.length > 0 && (
              <div className="mt-2 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Ver como org</p>
                <div className="flex flex-col gap-0.5">
                  {orgs.map((org) => (
                    <form key={org.id} action={selectOrg}>
                      <input type="hidden" name="slug" value={org.slug} />
                      <input type="hidden" name="redirectTo" value="/admin" />
                      <button
                        type="submit"
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          selectedSlug === org.slug
                            ? "bg-teal-50 text-teal-700 font-semibold"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          selectedSlug === org.slug ? "bg-teal-600" : "bg-teal-400"
                        }`} />
                        {org.name}
                      </button>
                    </form>
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
