"use client";

import { useState } from "react";
import AvailabilityForm from "./AvailabilityForm";
import SchedulesManager from "./SchedulesManager";

interface Rule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  scheduleId: string | null;
}

interface Blackout {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface Schedule {
  id: string;
  name: string;
  scheduleType: string;
  isDefault: boolean;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  availabilityRules: Rule[];
}

interface Day { value: number; label: string; }

interface Props {
  professionalId: string;
  rules: Rule[];
  blackouts: Blackout[];
  schedules: Schedule[];
  days: Day[];
}

export default function AvailabilityTabs({ professionalId, rules, blackouts, schedules, days }: Props) {
  const [tab, setTab] = useState<"horario" | "plantillas">("plantillas");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab("plantillas")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === "plantillas"
              ? "bg-white border border-b-white border-gray-200 text-teal-700 -mb-px"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          📅 Plantillas de horario
        </button>
        <button
          onClick={() => setTab("horario")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === "horario"
              ? "bg-white border border-b-white border-gray-200 text-teal-700 -mb-px"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🔒 Fechas bloqueadas
        </button>
      </div>

      {tab === "plantillas" && (
        <SchedulesManager
          professionalId={professionalId}
          schedules={schedules}
          days={days}
        />
      )}

      {tab === "horario" && (
        <AvailabilityForm
          professionalId={professionalId}
          rules={rules}
          blackouts={blackouts}
          days={days}
        />
      )}
    </div>
  );
}
