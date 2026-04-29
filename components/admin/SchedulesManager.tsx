"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Schedule } from "./AvailabilityTabs";

const SCHEDULE_TYPES = [
  { value: "NORMAL",   label: "Semana normal",   color: "bg-teal-100 text-teal-800",   icon: "💼" },
  { value: "HOLIDAY",  label: "Feriado",          color: "bg-blue-100 text-blue-800",   icon: "🎉" },
  { value: "VACATION", label: "Vacaciones",        color: "bg-amber-100 text-amber-800", icon: "🏖️" },
  { value: "CUSTOM",   label: "Personalizado",     color: "bg-purple-100 text-purple-800", icon: "✨" },
];

const DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

interface Props {
  professionalId: string;
  schedules: Schedule[];
  days: { value: number; label: string }[];
}

export default function SchedulesManager({ professionalId, schedules: initSchedules }: Props) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initSchedules);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form nueva plantilla
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    scheduleType: "NORMAL",
    isDefault: false,
    validFrom: "",
    validTo: "",
  });

  // Form nueva regla dentro de una plantilla
  const [newRule, setNewRule] = useState<Record<string, {
    dayOfWeek: number; startTime: string; endTime: string; slotDurationMinutes: number;
  }>>({})

  function ruleFormFor(scheduleId: string) {
    return newRule[scheduleId] ?? { dayOfWeek: 1, startTime: "08:00", endTime: "17:00", slotDurationMinutes: 30 };
  }

  async function createSchedule() {
    if (!newForm.name.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/availability/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, ...newForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSchedules(p => [...p, { ...data, availabilityRules: [] }]);
      setNewForm({ name: "", scheduleType: "NORMAL", isDefault: false, validFrom: "", validTo: "" });
      setShowNew(false);
      setExpanded(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("¿Eliminar esta plantilla y sus reglas?")) return;
    setSaving(true);
    await fetch(`/api/admin/availability/schedules?id=${id}`, { method: "DELETE" });
    setSchedules(p => p.filter(s => s.id !== id));
    setSaving(false);
  }

  async function setDefault(id: string) {
    setSaving(true);
    const res = await fetch("/api/admin/availability/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true, professionalId }),
    });
    if (res.ok) {
      setSchedules(p => p.map(s => ({ ...s, isDefault: s.id === id })));
    }
    setSaving(false);
    router.refresh();
  }

  async function addRuleToSchedule(scheduleId: string) {
    const form = ruleFormFor(scheduleId);
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, scheduleId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSchedules(p => p.map(s =>
        s.id === scheduleId
          ? { ...s, availabilityRules: [...s.availabilityRules, data] }
          : s
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function removeRuleFromSchedule(scheduleId: string, ruleId: string) {
    setSaving(true);
    await fetch(`/api/admin/availability?ruleId=${ruleId}`, { method: "DELETE" });
    setSchedules(p => p.map(s =>
      s.id === scheduleId
        ? { ...s, availabilityRules: s.availabilityRules.filter(r => r.id !== ruleId) }
        : s
    ));
    setSaving(false);
  }

  const typeInfo = (type: string) =>
    SCHEDULE_TYPES.find(t => t.value === type) ?? SCHEDULE_TYPES[0];

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>}

      {/* Lista de plantillas */}
      {schedules.length === 0 && !showNew && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="font-medium text-gray-700 mb-1">Sin plantillas de horario</p>
          <p className="text-sm text-gray-400 mb-4">
            Crea plantillas para definir diferentes versiones del horario:
            semana normal, feriados, vacaciones, etc.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            + Crear primera plantilla
          </button>
        </div>
      )}

      {schedules.map(schedule => {
        const info = typeInfo(schedule.scheduleType);
        const isOpen = expanded === schedule.id;
        const rf = ruleFormFor(schedule.id);

        return (
          <div key={schedule.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4">
              <button
                onClick={() => setExpanded(isOpen ? null : schedule.id)}
                className="flex-1 flex items-center gap-3 text-left"
              >
                <span className="text-xl">{info.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{schedule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                      {info.label}
                    </span>
                    {schedule.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium">
                        ★ Por defecto
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                    <span>{schedule.availabilityRules.length} regla{schedule.availabilityRules.length !== 1 ? "s" : ""}</span>
                    {schedule.validFrom && <span>Desde {schedule.validFrom}</span>}
                    {schedule.validTo   && <span>Hasta {schedule.validTo}</span>}
                    {!schedule.validFrom && !schedule.validTo && !schedule.isDefault && (
                      <span className="text-amber-500">Sin rango — activa como defecto para que aplique</span>
                    )}
                  </div>
                </div>
                <span className={`ml-auto text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              <div className="flex gap-2 shrink-0">
                {!schedule.isDefault && (
                  <button
                    onClick={() => setDefault(schedule.id)}
                    disabled={saving}
                    className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Usar por defecto
                  </button>
                )}
                <button
                  onClick={() => deleteSchedule(schedule.id)}
                  disabled={saving}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {/* Detalle expandido */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Tabla de reglas */}
                {schedule.scheduleType === "VACATION" ? (
                  <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
                    <p className="text-sm text-amber-700">
                      🏖️ <strong>Plantilla de vacaciones:</strong> no se generarán slots disponibles durante el rango de fechas activo.
                      No es necesario agregar reglas.
                    </p>
                  </div>
                ) : (
                  <>
                    {schedule.availabilityRules.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-gray-400">
                        Sin reglas — agrega los días y horarios que aplican en esta plantilla.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-4 py-2">Día</th>
                            <th className="text-left px-4 py-2">Desde</th>
                            <th className="text-left px-4 py-2">Hasta</th>
                            <th className="text-left px-4 py-2">Slot</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {schedule.availabilityRules.map(r => (
                            <tr key={r.id}>
                              <td className="px-4 py-2">{DAYS.find(d => d.value === r.dayOfWeek)?.label}</td>
                              <td className="px-4 py-2 tabular-nums">{r.startTime}</td>
                              <td className="px-4 py-2 tabular-nums">{r.endTime}</td>
                              <td className="px-4 py-2 tabular-nums">{r.slotDurationMinutes} min</td>
                              <td className="px-4 py-2">
                                <button
                                  onClick={() => removeRuleFromSchedule(schedule.id, r.id)}
                                  disabled={saving}
                                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Agregar regla a esta plantilla */}
                    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Día</label>
                        <select
                          value={rf.dayOfWeek}
                          onChange={e => setNewRule(p => ({ ...p, [schedule.id]: { ...ruleFormFor(schedule.id), dayOfWeek: Number(e.target.value) } }))}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                        >
                          {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Desde</label>
                        <input type="time" value={rf.startTime}
                          onChange={e => setNewRule(p => ({ ...p, [schedule.id]: { ...ruleFormFor(schedule.id), startTime: e.target.value } }))}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Hasta</label>
                        <input type="time" value={rf.endTime}
                          onChange={e => setNewRule(p => ({ ...p, [schedule.id]: { ...ruleFormFor(schedule.id), endTime: e.target.value } }))}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Slot (min)</label>
                        <input type="number" value={rf.slotDurationMinutes} min={5} max={120}
                          onChange={e => setNewRule(p => ({ ...p, [schedule.id]: { ...ruleFormFor(schedule.id), slotDurationMinutes: Number(e.target.value) } }))}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-20" />
                      </div>
                      <button
                        onClick={() => addRuleToSchedule(schedule.id)}
                        disabled={saving}
                        className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        + Agregar día
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Boton nueva plantilla */}
      {schedules.length > 0 && !showNew && (
        <button
          onClick={() => setShowNew(true)}
          className="self-start text-sm text-teal-700 hover:text-teal-900 border border-teal-200 hover:border-teal-400 px-4 py-2 rounded-lg transition-colors"
        >
          + Nueva plantilla
        </button>
      )}

      {/* Form nueva plantilla */}
      {showNew && (
        <div className="bg-white border border-teal-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Nueva plantilla de horario</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Nombre *</label>
              <input
                value={newForm.name}
                onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                placeholder="ej: Semana normal, Feriados mayo, Vacaciones julio"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Tipo</label>
              <select
                value={newForm.scheduleType}
                onChange={e => setNewForm(p => ({ ...p, scheduleType: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {SCHEDULE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Vigente desde (opcional)</label>
              <input
                type="date"
                value={newForm.validFrom}
                onChange={e => setNewForm(p => ({ ...p, validFrom: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Vigente hasta (opcional)</label>
              <input
                type="date"
                value={newForm.validTo}
                onChange={e => setNewForm(p => ({ ...p, validTo: e.target.value }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id="isDefault"
              checked={newForm.isDefault}
              onChange={e => setNewForm(p => ({ ...p, isDefault: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Usar como horario por defecto (aplica cuando no hay otra plantilla vigente)
            </label>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              ℹ️ <strong>Cómo funciona la prioridad:</strong> Si una semana tiene una plantilla con rango de fechas vigente,
              se usa esa. Si no, se usa la marcada como “por defecto”.
              Las <em>vacaciones</em> bloquean todos los slots del rango sin necesitar reglas.
            </p>
          </div>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="flex gap-3 mt-5">
            <button
              onClick={createSchedule}
              disabled={saving || !newForm.name.trim()}
              className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Crear plantilla"}
            </button>
            <button
              onClick={() => { setShowNew(false); setError(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg border border-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
