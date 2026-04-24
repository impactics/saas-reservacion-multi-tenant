"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
  currency: string | null;
}

interface Professional {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Slot {
  start: string;
  localStart: string;
  localEnd: string;
}

type Step = "service" | "datetime" | "patient" | "confirm";

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("service");
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [selectedService, setSelectedService] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");

  // Pre-seleccionar servicio desde query param
  useEffect(() => {
    const sid = searchParams.get("serviceId");
    if (sid) setSelectedService(sid);
  }, [searchParams]);

  // Cargar servicios
  useEffect(() => {
    fetch(`/api/${slug}/services`)
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .catch(() => setError("Error al cargar servicios"));
  }, [slug]);

  // Cargar profesionales cuando se elige servicio
  useEffect(() => {
    if (!selectedService) return;
    setLoading(true);
    fetch(`/api/${slug}/professionals?serviceId=${selectedService}`)
      .then((r) => r.json())
      .then((d) => setProfessionals(d.professionals ?? []))
      .catch(() => setError("Error al cargar profesionales"))
      .finally(() => setLoading(false));
  }, [slug, selectedService]);

  // Cargar slots cuando se elige profesional + fecha
  useEffect(() => {
    if (!selectedProfessional || !selectedDate) return;
    setLoading(true);
    setSlots([]);
    fetch(`/api/${slug}/availability?professionalId=${selectedProfessional}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setError("Error al cargar disponibilidad"))
      .finally(() => setLoading(false));
  }, [slug, selectedProfessional, selectedDate]);

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService,
          professionalId: selectedProfessional,
          scheduledAt: selectedSlot,
          patientName,
          patientEmail: patientEmail || undefined,
          patientPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear la reserva");
      router.push(`/${slug}/booking/confirmacion?bookingId=${data.booking.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  const service = services.find((s) => s.id === selectedService);
  const professional = professionals.find((p) => p.id === selectedProfessional);
  const slot = slots.find((s) => s.start === selectedSlot);
  const today = new Date().toISOString().split("T")[0];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-xl mx-auto px-4 py-4">
          <h1 className="font-semibold text-gray-900">Agendar cita</h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* STEP 1: Servicio */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">1. Servicio</h2>
          <div className="grid grid-cols-1 gap-2">
            {services.map((svc) => (
              <button
                key={svc.id}
                onClick={() => { setSelectedService(svc.id); setStep("datetime"); }}
                className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedService === svc.id
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-gray-200 hover:border-teal-300"
                }`}
              >
                <span className="font-medium">{svc.name}</span>
                <span className="ml-2 text-sm text-gray-400">{svc.durationMinutes} min</span>
              </button>
            ))}
          </div>
        </section>

        {/* STEP 2: Profesional + Fecha + Hora */}
        {selectedService && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">2. Fecha y hora</h2>

            {professionals.length > 1 && (
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Profesional</label>
                <div className="flex flex-wrap gap-2">
                  {professionals.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProfessional(p.id)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selectedProfessional === p.id
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-gray-200 hover:border-teal-300"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {professionals.length === 1 && !selectedProfessional && (
              <script dangerouslySetInnerHTML={{ __html: `
                (function(){
                  // auto-select solo profesional
                })();
              ` }} />
            )}

            {/* Auto-select si solo hay 1 profesional */}
            {professionals.length === 1 && selectedProfessional === "" && (() => {
              setSelectedProfessional(professionals[0].id);
              return null;
            })()}

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">Fecha</label>
              <input
                type="date"
                min={today}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {loading && <p className="text-sm text-gray-400">Cargando horarios...</p>}

            {!loading && selectedDate && slots.length === 0 && (
              <p className="text-sm text-gray-400">No hay horarios disponibles para este día.</p>
            )}

            {slots.length > 0 && (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Hora disponible</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.start}
                      onClick={() => { setSelectedSlot(s.start); setStep("patient"); }}
                      className={`px-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selectedSlot === s.start
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-gray-200 hover:border-teal-400"
                      }`}
                    >
                      {s.localStart}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 3: Datos del paciente */}
        {selectedSlot && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">3. Tus datos</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Ej: María Pérez"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Teléfono (WhatsApp) *</label>
                <input
                  type="tel"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="0991234567"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email (opcional)</label>
                <input
                  type="email"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </section>
        )}

        {/* STEP 4: Resumen + confirmar */}
        {selectedSlot && patientName && patientPhone && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">4. Confirmar reserva</h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Servicio</span>
                <span className="font-medium">{service?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Profesional</span>
                <span className="font-medium">{professional?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fecha</span>
                <span className="font-medium">{selectedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hora</span>
                <span className="font-medium">{slot?.localStart} — {slot?.localEnd}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Paciente</span>
                <span className="font-medium">{patientName}</span>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? "Agendando..." : "Confirmar cita"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
