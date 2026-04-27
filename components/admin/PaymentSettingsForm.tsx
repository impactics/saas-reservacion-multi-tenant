"use client";

/**
 * Formulario de configuración de pagos (Payphone + WhatsApp API)
 * por organización — solo visible para el admin de la org.
 */

import { useState } from "react";

type InitialData = {
  id:                string;
  payphoneEnabled:   boolean;
  payphoneStoreId:   string;
  payphoneTokenSet:  boolean;   // true = ya hay un token guardado
  wapiPhoneNumberId: string;
  wapiFromNumber:    string;
  wapiTokenSet:      boolean;   // true = ya hay un token guardado
};

export default function PaymentSettingsForm({ initialData }: { initialData: InitialData }) {
  const [payphone, setPayphone] = useState({
    enabled:  initialData.payphoneEnabled,
    storeId:  initialData.payphoneStoreId,
    token:    "",   // campo vacío = no cambiar el token guardado
    tokenSet: initialData.payphoneTokenSet,
  });

  const [wapi, setWapi] = useState({
    phoneNumberId: initialData.wapiPhoneNumberId,
    fromNumber:    initialData.wapiFromNumber,
    token:         "",   // campo vacío = no cambiar el token guardado
    tokenSet:      initialData.wapiTokenSet,
  });

  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [testingWa, setTestingWa] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  // ── Guardar ────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {
        payphoneEnabled:   payphone.enabled,
        payphoneStoreId:   payphone.storeId,
        wapiPhoneNumberId: wapi.phoneNumberId,
        wapiFromNumber:    wapi.fromNumber,
      };
      // solo enviamos el token si el admin escribió uno nuevo
      if (payphone.token.trim()) body.payphoneToken = payphone.token.trim();
      if (wapi.token.trim())     body.wapiToken     = wapi.token.trim();

      const res = await fetch("/api/admin/settings/payments", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ text: data.error ?? "Error al guardar", ok: false }); return; }

      // limpiar campos de token (ya guardados)
      setPayphone(p => ({ ...p, token: "", tokenSet: true }));
      setWapi(w    => ({ ...w, token: "", tokenSet: true }));
      setMsg({ text: "✅ Configuración guardada correctamente", ok: true });
    } finally {
      setSaving(false);
    }
  }

  // ── Test WhatsApp ──────────────────────────────────────────────────────────
  async function handleTestWa() {
    setTestingWa(true); setTestMsg("");
    try {
      const res = await fetch("/api/admin/settings/payments/test-whatsapp", {
        method: "POST",
      });
      const data = await res.json();
      setTestMsg(res.ok ? "✅ Mensaje de prueba enviado al número configurado" : `❌ ${data.error}`);
    } finally {
      setTestingWa(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-8 max-w-2xl">

      {/* ── Sección Payphone ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Payphone</h2>
            <p className="text-sm text-gray-500">Pasarela de pago con tarjeta para Ecuador</p>
          </div>
          {/* Toggle habilitado */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-600">{payphone.enabled ? "Habilitado" : "Deshabilitado"}</span>
            <div
              onClick={() => setPayphone(p => ({ ...p, enabled: !p.enabled }))}
              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                payphone.enabled ? "bg-teal-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  payphone.enabled ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store ID
            </label>
            <input
              type="text"
              value={payphone.storeId}
              onChange={e => setPayphone(p => ({ ...p, storeId: e.target.value }))}
              placeholder="Tu Store ID de Payphone"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Lo encuentras en Payphone Business → Configuración → Integración
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token de acceso
              {payphone.tokenSet && !payphone.token && (
                <span className="ml-2 text-xs font-normal text-green-600">✓ Configurado</span>
              )}
            </label>
            <input
              type="password"
              value={payphone.token}
              onChange={e => setPayphone(p => ({ ...p, token: e.target.value }))}
              placeholder={payphone.tokenSet ? "Dejar vacío para mantener el token actual" : "Token Bearer de Payphone"}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Payphone Business → Configuración → Integración → Token
            </p>
          </div>
        </div>
      </section>

      {/* ── Sección WhatsApp API ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">WhatsApp Business API</h2>
          <p className="text-sm text-gray-500">Notificaciones automáticas de citas vía Meta</p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number ID
            </label>
            <input
              type="text"
              value={wapi.phoneNumberId}
              onChange={e => setWapi(w => ({ ...w, phoneNumberId: e.target.value }))}
              placeholder="1156736894180509"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Meta for Developers → Tu app → WhatsApp → Configuración de la API → Identificador de número
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número emisor (From)
            </label>
            <input
              type="tel"
              value={wapi.fromNumber}
              onChange={e => setWapi(w => ({ ...w, fromNumber: e.target.value }))}
              placeholder="+15551800156"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              El número de prueba que aparece en "De" dentro de la configuración de la API
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token de acceso
              {wapi.tokenSet && !wapi.token && (
                <span className="ml-2 text-xs font-normal text-green-600">✓ Configurado</span>
              )}
            </label>
            <input
              type="password"
              value={wapi.token}
              onChange={e => setWapi(w => ({ ...w, token: e.target.value }))}
              placeholder={wapi.tokenSet ? "Dejar vacío para mantener el token actual" : "Token de acceso (EAANZCnx...)"}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Meta for Developers → Tu app → WhatsApp → Inicio rápido → Token de acceso
            </p>
          </div>
        </div>

        {/* Botón de prueba */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleTestWa}
            disabled={testingWa || (!wapi.tokenSet && !wapi.token)}
            className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {testingWa ? "Enviando..." : "📨 Enviar mensaje de prueba"}
          </button>
          {testMsg && (
            <span className={`text-sm ${
              testMsg.startsWith("✅") ? "text-green-700" : "text-red-600"
            }`}>
              {testMsg}
            </span>
          )}
        </div>
      </section>

      {/* ── Política de cancelación (resumen) ───────────────────────────── */}
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-amber-800 mb-1">💡 Política de cancelación activa</h2>
        <ul className="text-sm text-amber-700 list-disc list-inside space-y-0.5">
          <li>Reembolso <strong>100%</strong> si cancela con más de 24 h de anticipación</li>
          <li>Reembolso <strong>50%</strong> si cancela entre 12–24 h antes</li>
          <li>Sin reembolso si cancela con menos de 12 h</li>
        </ul>
        <p className="text-xs text-amber-600 mt-2">
          Para cambiar estos porcentajes ve a Configuración general.
        </p>
      </section>

      {/* ── Guardar ───────────────────────────────────────────────────────── */}
      {msg && (
        <p className={`text-sm rounded-lg px-4 py-3 ${
          msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
        }`}>
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="self-start bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-medium px-8 py-2.5 rounded-lg transition-colors"
      >
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}
