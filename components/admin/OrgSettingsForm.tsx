"use client";

import { useState } from "react";

interface Org {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  phoneWhatsapp: string | null;
  timezone: string;
  whatsappEnabled: boolean;
  googleCalendarEnabled: boolean;
}

const TIMEZONES = [
  "America/Guayaquil", "America/Lima", "America/Bogota", "America/Mexico_City",
  "America/Santiago", "America/Argentina/Buenos_Aires", "America/Caracas",
  "America/La_Paz", "America/Asuncion", "America/Montevideo", "Europe/Madrid",
];

export default function OrgSettingsForm({ org }: { org: Org }) {
  const [form, setForm] = useState({
    name: org.name,
    logoUrl: org.logoUrl ?? "",
    phoneWhatsapp: org.phoneWhatsapp ?? "",
    timezone: org.timezone,
    whatsappEnabled: org.whatsappEnabled,
    googleCalendarEnabled: org.googleCalendarEnabled,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else { const d = await res.json(); setError(d.error ?? "Error al guardar"); }
    setSaving(false);
  };

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-5">
        <h2 className="font-semibold text-gray-800">Información general</h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Nombre de la organización</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">URL del logo</label>
          <input value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
            placeholder="https://..." className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Zona horaria</label>
          <select value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">WhatsApp (número con código de país)</label>
          <input value={form.phoneWhatsapp} onChange={(e) => setForm((p) => ({ ...p, phoneWhatsapp: e.target.value }))}
            placeholder="+593999999999" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-5">
        <h2 className="font-semibold text-gray-800">Integraciones</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={form.whatsappEnabled}
              onChange={(e) => setForm((p) => ({ ...p, whatsappEnabled: e.target.checked }))} />
            <div className={`w-10 h-6 rounded-full transition-colors ${
              form.whatsappEnabled ? "bg-teal-600" : "bg-gray-200"
            }`}>
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                form.whatsappEnabled ? "translate-x-4" : "translate-x-0"
              }`} />
            </div>
          </div>
          <span className="text-sm text-gray-700">Notificaciones por WhatsApp</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={form.googleCalendarEnabled}
              onChange={(e) => setForm((p) => ({ ...p, googleCalendarEnabled: e.target.checked }))} />
            <div className={`w-10 h-6 rounded-full transition-colors ${
              form.googleCalendarEnabled ? "bg-teal-600" : "bg-gray-200"
            }`}>
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                form.googleCalendarEnabled ? "translate-x-4" : "translate-x-0"
              }`} />
            </div>
          </div>
          <span className="text-sm text-gray-700">Sincronización con Google Calendar</span>
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={saving}
          className="bg-teal-700 hover:bg-teal-800 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {saved && <span className="text-sm text-teal-700">✓ Guardado correctamente</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500">URL pública de tu agenda:</p>
        <p className="text-sm font-medium text-gray-800 mt-1">/{org.slug}</p>
      </div>
    </div>
  );
}
