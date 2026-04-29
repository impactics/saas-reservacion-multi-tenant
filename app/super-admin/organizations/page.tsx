"use client";

import { useEffect, useState, useRef } from "react";

type Org = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count: { professionals: number; bookings: number };
};

export default function SuperAdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal crear
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", timezone: "America/Guayaquil" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Modal eliminar — paso 1 y paso 2
  const [deleteTarget, setDeleteTarget] = useState<Org | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/organizations");
    const data = await res.json();
    setOrgs(data.orgs ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-generar slug desde nombre
  const handleNameChange = (v: string) => {
    const slug = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm((f) => ({ ...f, name: v, slug }));
  };

  const handleCreate = async () => {
    setCreateError("");
    setCreating(true);
    const res = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error ?? "Error al crear"); return; }
    setShowCreate(false);
    setForm({ name: "", slug: "", timezone: "America/Guayaquil" });
    load();
  };

  const openDelete = (org: Org) => {
    setDeleteTarget(org);
    setDeleteStep(1);
    setDeleteConfirmName("");
    setDeleteError("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmName !== deleteTarget.name) {
      setDeleteError("El nombre no coincide");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/organizations/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) { setDeleteError(data.error ?? "Error al eliminar"); return; }
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organizaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión global de tenants del SaaS</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(""); setTimeout(() => nameInputRef.current?.focus(), 80); }}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span> Nueva organización
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : orgs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🏢</div>
            <p className="text-gray-500 font-medium">No hay organizaciones</p>
            <p className="text-gray-400 text-sm mt-1">Crea la primera organización para comenzar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Profesionales</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reservas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">{org.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{org.slug}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{org._count.professionals}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{org._count.bookings}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(org.createdAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openDelete(org)}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ========== MODAL: CREAR ========== */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nueva organización</h2>
              <p className="text-sm text-gray-500 mt-0.5">Se creará un nuevo tenant en el sistema</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Nombre <span className="text-red-500">*</span></label>
                <input
                  ref={nameInputRef}
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Clínica Bienestar"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              {/* Slug */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Slug (URL) <span className="text-red-500">*</span></label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                  placeholder="clinica-bienestar"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400">Solo minúsculas, números y guiones. Se usará en la URL: <span className="font-mono">/{form.slug || "..."}</span></p>
              </div>
              {/* Timezone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">Zona horaria</label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="America/Guayaquil">America/Guayaquil (ECT −5)</option>
                  <option value="America/Bogota">America/Bogota (COT −5)</option>
                  <option value="America/Lima">America/Lima (PET −5)</option>
                  <option value="America/Mexico_City">America/Mexico_City (CST −6)</option>
                  <option value="America/Santiago">America/Santiago (CLT −4)</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo (BRT −3)</option>
                  <option value="America/Buenos_Aires">America/Buenos_Aires (ART −3)</option>
                  <option value="Europe/Madrid">Europe/Madrid (CET +1)</option>
                </select>
              </div>
              {createError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{createError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreate(false); setCreateError(""); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.name || !form.slug}
                className="px-4 py-2 text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creando..." : "Crear organización"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: ELIMINAR — PASO 1 ========== */}
      {deleteTarget && deleteStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg">⚠️</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">¿Eliminar organización?</h2>
                  <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mt-4">
                <p className="text-sm text-gray-600">Estás a punto de eliminar:</p>
                <p className="font-bold text-gray-900 mt-1">{deleteTarget.name}</p>
                <p className="font-mono text-xs text-gray-500">{deleteTarget.slug}</p>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span>👤 {deleteTarget._count.professionals} profesionales</span>
                  <span>📅 {deleteTarget._count.bookings} reservas</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-4">
                Se eliminarán <strong>todos los datos</strong> asociados: profesionales, servicios, reservas, pacientes y configuración.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => setDeleteStep(2)}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Sí, continuar →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: ELIMINAR — PASO 2 (confirmar escribiendo nombre) ========== */}
      {deleteTarget && deleteStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-red-700">Confirmación final</h2>
              <p className="text-sm text-gray-500 mt-0.5">Para confirmar, escribe el nombre exacto de la organización</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  Escribe <span className="font-mono text-red-600 bg-red-50 px-1 rounded">{deleteTarget.name}</span> para confirmar
                </label>
                <input
                  autoFocus
                  value={deleteConfirmName}
                  onChange={(e) => { setDeleteConfirmName(e.target.value); setDeleteError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                  placeholder={deleteTarget.name}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmName !== deleteTarget.name}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Eliminando..." : "Eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
