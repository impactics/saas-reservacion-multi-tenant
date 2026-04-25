"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Rule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

interface Blackout {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

interface Day { value: number; label: string; }

interface Props {
  professionalId: string;
  rules: Rule[];
  blackouts: Blackout[];
  days: Day[];
}

export default function AvailabilityForm({ professionalId, rules: initRules, blackouts: initBlackouts, days }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(initRules);
  const [blackouts, setBlackouts] = useState(initBlackouts);
  const [saving, setSaving] = useState(false);

  // Nuevo regla
  const [newRule, setNewRule] = useState({
    dayOfWeek: 1, startTime: "08:00", endTime: "17:00", slotDurationMinutes: 30,
  });

  // Nueva fecha bloqueada
  const [newBlackout, setNewBlackout] = useState({ date: "", reason: "" });

  const addRule = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, ...newRule }),
    });
    const data = await res.json();
    if (res.ok) setRules((p) => [...p, data]);
    setSaving(false);
    router.refresh();
  };

  const removeRule = async (ruleId: string) => {
    setSaving(true);
    await fetch(`/api/admin/availability?ruleId=${ruleId}`, { method: "DELETE" });
    setRules((p) => p.filter((r) => r.id !== ruleId));
    setSaving(false);
  };

  const addBlackout = async () => {
    if (!newBlackout.date) return;
    setSaving(true);
    const res = await fetch("/api/admin/availability/blackout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, date: newBlackout.date, reason: newBlackout.reason }),
    });
    const data = await res.json();
    if (res.ok) setBlackouts((p) => [...p, data]);
    setSaving(false);
    setNewBlackout({ date: "", reason: "" });
  };

  const removeBlackout = async (id: string) => {
    setSaving(true);
    await fetch(`/api/admin/availability/blackout?id=${id}`, { method: "DELETE" });
    setBlackouts((p) => p.filter((b) => b.id !== id));
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Reglas semanales */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Horario semanal</h2>
        </div>

        {rules.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Sin reglas configuradas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Día</th>
                <th className="text-left px-4 py-2">Desde</th>
                <th className="text-left px-4 py-2">Hasta</th>
                <th className="text-left px-4 py-2">Slot (min)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{days.find((d) => d.value === r.dayOfWeek)?.label}</td>
                  <td className="px-4 py-2 tabular-nums">{r.startTime}</td>
                  <td className="px-4 py-2 tabular-nums">{r.endTime}</td>
                  <td className="px-4 py-2 tabular-nums">{r.slotDurationMinutes}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => removeRule(r.id)} disabled={saving}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Agregar regla */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Día</label>
            <select value={newRule.dayOfWeek}
              onChange={(e) => setNewRule((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              {days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Desde</label>
            <input type="time" value={newRule.startTime}
              onChange={(e) => setNewRule((p) => ({ ...p, startTime: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="time" value={newRule.endTime}
              onChange={(e) => setNewRule((p) => ({ ...p, endTime: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Slot (min)</label>
            <input type="number" value={newRule.slotDurationMinutes} min={5} max={120}
              onChange={(e) => setNewRule((p) => ({ ...p, slotDurationMinutes: Number(e.target.value) }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-20" />
          </div>
          <button onClick={addRule} disabled={saving}
            className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            + Agregar
          </button>
        </div>
      </div>

      {/* Fechas bloqueadas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Fechas bloqueadas</h2>
        </div>

        {blackouts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Sin fechas bloqueadas próximas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Motivo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {blackouts.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 tabular-nums">{b.date.slice(0, 10)}</td>
                  <td className="px-4 py-2 text-gray-500">{b.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => removeBlackout(b.id)} disabled={saving}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Fecha</label>
            <input type="date" value={newBlackout.date}
              onChange={(e) => setNewBlackout((p) => ({ ...p, date: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Motivo (opcional)</label>
            <input type="text" value={newBlackout.reason} placeholder="Ej: Feriado"
              onChange={(e) => setNewBlackout((p) => ({ ...p, reason: e.target.value }))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={addBlackout} disabled={saving || !newBlackout.date}
            className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            + Bloquear
          </button>
        </div>
      </div>
    </div>
  );
}
