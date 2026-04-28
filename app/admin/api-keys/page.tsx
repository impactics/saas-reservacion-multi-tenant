"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  allowedOrigins: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const SLUG = process.env.NEXT_PUBLIC_ORG_SLUG ?? "";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100 transition-colors"
    >
      {copied ? "✓ Copiado" : "Copiar"}
    </button>
  );
}

export default function ApiKeysPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newOrigins, setNewOrigins] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState("");
  const [error, setError] = useState("");
  const [showSnippet, setShowSnippet] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (!SLUG) return;
    fetch(`/api/admin/api-keys?slug=${SLUG}`)
      .then(r => r.json())
      .then(d => setKeys(d.keys ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function createKey() {
    if (!newName.trim()) return;
    setCreating(true); setError(""); setCreatedKey("");
    try {
      const origins = newOrigins
        .split("\n")
        .map(o => o.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: SLUG, name: newName.trim(), allowedOrigins: origins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreatedKey(data.key);
      setNewName(""); setNewOrigins("");
      // Recargar lista
      const list = await fetch(`/api/admin/api-keys?slug=${SLUG}`).then(r => r.json());
      setKeys(list.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("¿Revocar esta API key? Las integraciones que la usen dejarán de funcionar.")) return;
    await fetch(`/api/admin/api-keys?id=${id}`, { method: "DELETE" });
    setKeys(k => k.filter(x => x.id !== id));
  }

  function buildSnippet(key: string, origins: string[]) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://tu-saas.com";
    return `<!-- Widget de reservas - pegar antes de </body> -->
<div id="booking-widget"></div>
<script>
(function() {
  var API_BASE  = "${base}";
  var API_KEY   = "${key}";
  var ORG_SLUG  = "${SLUG}";

  // Carga el widget de reservas
  var script = document.createElement('script');
  script.src = API_BASE + '/widget/booking.js';
  script.dataset.slug   = ORG_SLUG;
  script.dataset.apiKey = API_KEY;
  script.dataset.target = 'booking-widget';
  script.async = true;
  document.body.appendChild(script);
})();
</script>`;
  }

  if (status === "loading" || loading) {
    return <div className="p-8 text-gray-400">Cargando...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">API Keys</h1>
      <p className="text-sm text-gray-500 mb-6">
        Genera una key por cada ecommerce donde quieras integrar el widget de reservas.
        Cada key puede tener sus propios orígenes CORS permitidos.
      </p>

      {/* Alerta key recién creada */}
      {createdKey && (
        <div className="mb-6 bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-teal-800 mb-1">✅ API Key creada — cópiala ahora, no volverá a mostrarse</p>
          <div className="flex items-center gap-2 bg-white rounded-lg border border-teal-200 px-3 py-2 font-mono text-xs text-teal-900 break-all">
            <span className="flex-1">{createdKey}</span>
            <CopyBtn text={createdKey} />
          </div>
          <button
            onClick={() => setShowSnippet(createdKey)}
            className="mt-3 text-sm text-teal-700 underline hover:text-teal-900"
          >
            Ver snippet de integración para el ecommerce →
          </button>
        </div>
      )}

      {/* Snippet de integración */}
      {showSnippet && (
        <div className="mb-6 bg-gray-900 text-green-300 rounded-xl p-4 text-xs font-mono overflow-x-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">snippet — pegar en el ecommerce</span>
            <div className="flex gap-2">
              <CopyBtn text={buildSnippet(showSnippet, [])} />
              <button onClick={() => setShowSnippet("")} className="text-gray-500 hover:text-white text-xs">✕</button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap">{buildSnippet(showSnippet, [])}</pre>
        </div>
      )}

      {/* Crear nueva key */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">Nueva API Key</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nombre (ej: "Ecommerce Dra. María Belén")</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Mi tienda WooCommerce"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Orígenes CORS permitidos <span className="text-gray-400">(uno por línea, ej: https://dramariabelencerda.com)</span>
            </label>
            <textarea
              value={newOrigins}
              onChange={e => setNewOrigins(e.target.value)}
              rows={3}
              placeholder={"https://dramariabelencerda.com\nhttps://www.mitienda.com"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">Deja vacío para permitir cualquier origen (no recomendado en producción).</p>
          </div>
          <button
            onClick={createKey}
            disabled={creating || !newName.trim()}
            className="self-start bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {creating ? "Generando..." : "Generar API Key"}
          </button>
        </div>
      </section>

      {/* Lista de keys */}
      <section>
        <h2 className="font-semibold text-gray-800 mb-3">Keys activas</h2>
        {keys.filter(k => k.active).length === 0 && (
          <p className="text-sm text-gray-400">No hay API keys activas.</p>
        )}
        <div className="flex flex-col gap-3">
          {keys.filter(k => k.active).map(key => (
            <div key={key.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{key.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{key.keyPrefix}••••••••••••••••••••••••••••••••</p>
                  {key.allowedOrigins.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {key.allowedOrigins.map(o => (
                        <span key={o} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{o}</span>
                      ))}
                    </div>
                  )}
                  {key.allowedOrigins.length === 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-2 inline-block">⚠ Sin restricción de origen</span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => alert("Para ver el snippet, crea una nueva key o guarda la key al momento de crearla.")}
                    className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    Snippet
                  </button>
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded-lg transition-colors"
                  >
                    Revocar
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Creada {new Date(key.createdAt).toLocaleDateString("es-EC")}
                {key.lastUsedAt && ` · Último uso ${new Date(key.lastUsedAt).toLocaleDateString("es-EC")}`}
                {!key.lastUsedAt && " · Nunca usada"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
