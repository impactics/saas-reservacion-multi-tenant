"use client";

/**
 * /{slug}/mis-citas
 *
 * Portal del paciente: ver citas, reprogramar y cancelar.
 * Autenticación OTP vía WhatsApp.
 *
 * Next.js 15: params es una Promise — se desenvuelve con React.use()
 */

import { use, useState, useEffect, useCallback } from "react";

type Booking = {
  id:              string;
  scheduledAt:     string;
  status:          string;
  paymentStatus:   string;
  durationMinutes: number;
  service:         { name: string; price: string; currency: string };
  professional:    { name: string; specialty: string | null };
  reschedules:     { id: string }[];
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  CONFIRMED:   { label: "Confirmada",   color: "bg-green-100 text-green-800" },
  PENDING:     { label: "Pendiente",    color: "bg-yellow-100 text-yellow-800" },
  RESCHEDULED: { label: "Reprogramada", color: "bg-blue-100 text-blue-800" },
  CANCELLED:   { label: "Cancelada",    color: "bg-red-100 text-red-800" },
  COMPLETED:   { label: "Completada",   color: "bg-gray-100 text-gray-700" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-EC", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Guayaquil",
  });
}

// ─────────────────────────────────────────────────────────────

export default function MisCitasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // ✅ Next.js 15: params es una Promise, se desenvuelve con React.use()
  const { slug } = use(params);

  // Auth state
  const [step, setStep]           = useState<"phone" | "otp" | "portal">("phone");
  const [phone, setPhone]         = useState("");
  const [name, setName]           = useState("");
  const [otp, setOtp]             = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading]     = useState(false);

  // Portal state
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loadingBk, setLoadingBk]         = useState(false);
  const [activeTab, setActiveTab]         = useState<"upcoming" | "all">("upcoming");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg]         = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [cancelReason, setCancelReason]   = useState("");
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const apiBase = `/api/${slug}`;

  // ── Cargar citas ─────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoadingBk(true);
    try {
      const url =
        activeTab === "upcoming"
          ? `${apiBase}/patients/me/bookings?upcoming=true`
          : `${apiBase}/patients/me/bookings`;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) { setStep("phone"); return; }
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } finally {
      setLoadingBk(false);
    }
  }, [activeTab, apiBase]);

  useEffect(() => {
    if (step === "portal") fetchBookings();
  }, [step, activeTab, fetchBookings]);

  // Verificar sesión activa al montar
  useEffect(() => {
    fetch(`${apiBase}/patients/me/bookings?upcoming=true`, { credentials: "include" })
      .then(r => { if (r.ok) setStep("portal"); })
      .catch(() => {});
  }, [apiBase]);

  // ── Auth: solicitar OTP ───────────────────────────────────────────────────────
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setAuthError("");
    try {
      const res = await fetch(`${apiBase}/auth/otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "request", phone, name }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error ?? "Error al enviar código"); return; }
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  // ── Auth: verificar OTP ───────────────────────────────────────────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setAuthError("");
    try {
      const res = await fetch(`${apiBase}/auth/otp`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ action: "verify", phone, code: otp, name }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error ?? "Código incorrecto"); return; }
      setStep("portal");
    } finally {
      setLoading(false);
    }
  }

  // ── Cancelar cita ─────────────────────────────────────────────────────────────
  async function handleCancel(bookingId: string) {
    setActionLoading(bookingId); setActionMsg(null);
    try {
      const res = await fetch(`${apiBase}/bookings/${bookingId}/cancel`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg({ id: bookingId, msg: data.error ?? "Error al cancelar", ok: false });
        return;
      }
      let msg = "✅ Cita cancelada.";
      if (data.refundPct === 100)    msg += " Se procesará tu reembolso total.";
      else if (data.refundPct > 0)   msg += ` Reembolso parcial (${data.refundPct}%) en camino.`;
      else                           msg += " No aplica reembolso por política de cancelación.";
      setActionMsg({ id: bookingId, msg, ok: true });
      setExpandedId(null);
      fetchBookings();
    } finally {
      setActionLoading(null);
    }
  }

  // ── Render: pantalla de login ─────────────────────────────────────────────────
  if (step === "phone") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-4xl">👤</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">Mis citas</h1>
            <p className="text-gray-500 text-sm mt-1">
              Ingresa tu número de WhatsApp para ver tus citas
            </p>
          </div>
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Tu nombre completo"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+593 99 999 0000" required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {authError && <p className="text-red-600 text-sm">{authError}</p>}
            <button
              type="submit" disabled={loading}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Enviando..." : "Recibir código por WhatsApp"}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-4">
            Te enviaremos un código de verificación de 6 dígitos.
          </p>
        </div>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-4xl">🔐</span>
            <h1 className="text-xl font-bold text-gray-900 mt-2">Verifica tu WhatsApp</h1>
            <p className="text-gray-500 text-sm mt-1">
              Ingresa el código de 6 dígitos enviado a <strong>{phone}</strong>
            </p>
          </div>
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <input
              type="text" value={otp} onChange={e => setOtp(e.target.value)}
              placeholder="000000" maxLength={6} required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {authError && <p className="text-red-600 text-sm text-center">{authError}</p>}
            <button
              type="submit" disabled={loading}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Verificando..." : "Verificar"}
            </button>
            <button
              type="button" onClick={() => setStep("phone")}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Cambiar número
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: portal de citas ───────────────────────────────────────────────────
  const canChange = (b: Booking) =>
    ["CONFIRMED", "PENDING", "RESCHEDULED"].includes(b.status) &&
    new Date(b.scheduledAt) > new Date();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🗓️ Mis citas</h1>
          <a href={`/${slug}`} className="text-sm text-teal-700 hover:underline">
            ← Inicio
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {(["upcoming", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t
                  ? "border-teal-700 text-teal-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "upcoming" ? "Próximas" : "Todas"}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loadingBk ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-700 border-t-transparent" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="text-5xl block mb-3">📅</span>
            <p className="font-medium">
              No tienes citas {activeTab === "upcoming" ? "próximas" : "aún"}
            </p>
            <a
              href={`/${slug}/servicios`}
              className="mt-4 inline-block bg-teal-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-teal-800"
            >
              Agendar nueva cita
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((bk) => {
              const st   = STATUS_LABEL[bk.status] ?? { label: bk.status, color: "bg-gray-100 text-gray-700" };
              const open = expandedId === bk.id;
              const msg  = actionMsg?.id === bk.id ? actionMsg : null;
              return (
                <div key={bk.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{bk.service.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">👩‍⚕️ {bk.professional.name}</p>
                        <p className="text-sm text-gray-700 mt-1">
                          📅 {formatDate(bk.scheduledAt)}
                        </p>
                        <p className="text-xs text-gray-400">⏱ {bk.durationMinutes} min</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    {canChange(bk) && (
                      <button
                        onClick={() => setExpandedId(open ? null : bk.id)}
                        className="mt-3 text-sm text-teal-700 hover:underline font-medium"
                      >
                        {open ? "Cerrar" : "Gestionar cita"}
                      </button>
                    )}
                  </div>

                  {/* Panel de acción */}
                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4 flex flex-col gap-3">
                      <p className="text-sm text-gray-600 font-medium">¿Qué deseas hacer?</p>

                      {/* Reprogramar */}
                      <a
                        href={`/${slug}/booking?reschedule=${bk.id}`}
                        className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-4 py-2.5 hover:bg-gray-50"
                      >
                        🔄 <span>Reprogramar cita</span>
                      </a>

                      {/* Cancelar */}
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                          placeholder="Motivo de cancelación (opcional)"
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                        <button
                          onClick={() => handleCancel(bk.id)}
                          disabled={!!actionLoading}
                          className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 hover:bg-red-100 disabled:opacity-50"
                        >
                          {actionLoading === bk.id ? "Cancelando..." : "❌ Cancelar cita"}
                        </button>
                      </div>

                      {msg && (
                        <p className={`text-sm rounded-lg px-3 py-2 ${
                          msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                        }`}>
                          {msg.msg}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href={`/${slug}/servicios`}
            className="inline-block bg-teal-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-teal-800 transition-colors"
          >
            + Agendar nueva cita
          </a>
        </div>
      </div>
    </main>
  );
}
