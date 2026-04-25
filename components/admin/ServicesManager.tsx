"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  currency: string;
  active: boolean;
  professionalId: string;
  professionalName: string;
}

interface Professional { id: string; name: string; }

interface Props {
  orgId: string;
  services: Service[];
  professionals: Professional[];
}

const emptyForm = { professionalId: "", name: "", description: "", durationMinutes: 30, price: 0, currency: "USD" };

export default function ServicesManager({ services: init, professionals }: Props) {
  const router = useRouter();
  const [services, setServices] = useState(init);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, professionalId: professionals[0]?.id ?? "" });
  const [editId, setEditId] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    if (editId) {
      const res = await fetch(`/api/admin/services/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description,
          durationMinutes: form.durationMinutes, price: form.price, currency: form.currency,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setServices((p) => p.map((s) => s.id === editId ? { ...s, ...updated, price: Number(updated.price), professionalName: s.professionalName } : s));
      }
    } else {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { router.refresh(); }
    }
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm({ ...emptyForm, professionalId: professionals[0]?.id ?? "" });
  };

  const deactivate = async (id: string) => {
    if (!confirm("¿Desactivar este servicio?")) return;
    setSaving(true);
    await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
    setServices((p) => p.map((s) => s.id === id ? { ...s, active: false } : s));
    setSaving(false);
  };

  const startEdit = (svc: Service) => {
    setForm({ professionalId: svc.professionalId, name: svc.name, description: svc.description ?? "", durationMinutes: svc.durationMinutes, price: svc.price, currency: svc.currency });
    setEditId(svc.id);
    setShowForm(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ ...emptyForm, professionalId: professionals[0]?.id ?? "" }); }}
          className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Nuevo servicio
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          <h3 className="font-semibold text-gray-800">{editId ? "Editar servicio" : "Nuevo servicio"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!editId && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Profesional</label>
                <select value={form.professionalId}
                  onChange={(e) => setForm((p) => ({ ...p, professionalId: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-gray-500">Nombre *</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Consulta general" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-gray-500">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2} className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Duración (min)</label>
              <input type="number" value={form.durationMinutes} min={5} max={480}
                onChange={(e) => setForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Precio</label>
              <div className="flex gap-2">
                <input type="number" value={form.price} min={0} step={0.01}
                  onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1" />
                <select value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-20">
                  <option>USD</option><option>EUR</option><option>ARS</option><option>COP</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name}
              className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {services.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">Sin servicios creados</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Servicio</th>
                <th className="text-left px-4 py-3">Profesional</th>
                <th className="text-left px-4 py-3">Duración</th>
                <th className="text-left px-4 py-3">Precio</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((svc) => (
                <tr key={svc.id} className={`hover:bg-gray-50 transition-colors ${!svc.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{svc.name}</div>
                    {svc.description && <div className="text-xs text-gray-400 truncate max-w-xs">{svc.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{svc.professionalName}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{svc.durationMinutes} min</td>
                  <td className="px-4 py-3 tabular-nums">
                    {Number(svc.price).toLocaleString("es-EC", { style: "currency", currency: svc.currency })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      svc.active ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-500"
                    }`}>{svc.active ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => startEdit(svc)}
                        className="text-xs text-blue-600 hover:text-blue-800">Editar</button>
                      {svc.active && (
                        <button onClick={() => deactivate(svc.id)} disabled={saving}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Desactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
