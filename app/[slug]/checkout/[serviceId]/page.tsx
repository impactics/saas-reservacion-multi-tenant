/**
 * Página de checkout — /[slug]/checkout/[serviceId]?bookingId=xxx
 *
 * Detecta el proveedor desde la variable NEXT_PUBLIC_PAYMENT_PROVIDER
 * y renderiza el formulario correspondiente:
 *   - Stripe  → carga Stripe.js + Payment Element
 *   - MercadoPago → redirige automáticamente al init_point
 *
 * Flujo:
 *   1. Llama a POST /api/[slug]/checkout con el bookingId
 *   2. Stripe: monta el Payment Element con el clientSecret
 *   3. MercadoPago: redirige al init_point de la preferencia
 *   4. Al completar el pago, el webhook /api/webhooks/payment confirma la reserva
 *   5. Stripe retorna al usuario a /[slug]/booking/confirmacion?bookingId=xxx
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface CheckoutStripe {
  provider: "stripe";
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
}

interface CheckoutMP {
  provider: "mercadopago";
  initPoint: string;
  sandboxInitPoint: string;
  preferenceId: string;
}

type CheckoutData = CheckoutStripe | CheckoutMP;

// ── Componente principal ──────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("bookingId");
  const paymentError = searchParams.get("error");

  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(paymentError === "payment_failed" ? "El pago no pudo procesarse. Intenta de nuevo." : "");

  const fetchCheckout = useCallback(async () => {
    if (!bookingId) { setError("Reserva no encontrada"); setLoading(false); return; }
    try {
      const res = await fetch(`/api/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al iniciar el pago");
      setCheckout(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [bookingId, slug]);

  useEffect(() => { fetchCheckout(); }, [fetchCheckout]);

  // MercadoPago: redirigir automáticamente al init_point
  useEffect(() => {
    if (!checkout || checkout.provider !== "mercadopago") return;
    const isDev = process.env.NODE_ENV === "development";
    const url = isDev ? checkout.sandboxInitPoint : checkout.initPoint;
    if (url) window.location.href = url;
  }, [checkout]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Preparando el pago...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 p-8 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-gray-700 text-sm text-center">{error}</p>
          <button
            onClick={() => { setError(""); setLoading(true); fetchCheckout(); }}
            className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Reintentar
          </button>
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">
            Volver
          </button>
        </div>
      </main>
    );
  }

  // MercadoPago: mientras redirige, mostrar spinner
  if (checkout?.provider === "mercadopago") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Redirigiendo a MercadoPago...</p>
        </div>
      </main>
    );
  }

  // Stripe: formulario inline
  if (checkout?.provider === "stripe") {
    return <StripeCheckoutForm checkout={checkout} slug={slug} bookingId={bookingId!} />;
  }

  return null;
}

// ── Stripe Payment Form ───────────────────────────────────────────────────────

function StripeCheckoutForm({
  checkout,
  slug,
  bookingId,
}: {
  checkout: CheckoutStripe;
  slug: string;
  bookingId: string;
}) {
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Cargar Stripe.js dinámicamente
  useEffect(() => {
    if (document.getElementById("stripe-js")) { setStripeLoaded(true); return; }
    const script = document.createElement("script");
    script.id = "stripe-js";
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => setStripeLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Montar Stripe Elements
  useEffect(() => {
    if (!stripeLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Stripe = (window as any).Stripe;
    if (!Stripe) return;

    const stripe = Stripe(checkout.publishableKey);
    const elements = stripe.elements({ clientSecret: checkout.clientSecret });
    const paymentElement = elements.create("payment", {
      layout: "tabs",
    });

    const mountEl = document.getElementById("payment-element");
    if (mountEl) paymentElement.mount("#payment-element");

    const form = document.getElementById("stripe-form") as HTMLFormElement | null;
    if (!form) return;

    const handleSubmit = async (e: Event) => {
      e.preventDefault();
      setPaying(true);
      setPayError("");

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${appUrl}/${slug}/booking/confirmacion?bookingId=${bookingId}`,
        },
      });

      if (result.error) {
        setPayError(result.error.message ?? "Error en el pago");
        setPaying(false);
      }
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [stripeLoaded, checkout, slug, bookingId, appUrl]);

  const formatted = new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: checkout.currency,
  }).format(checkout.amount);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Pago de la cita</h1>
          <p className="text-sm text-gray-500 mt-1">Total a pagar: <span className="font-semibold text-gray-800">{formatted}</span></p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {!stripeLoaded ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form id="stripe-form" className="flex flex-col gap-4">
              <div id="payment-element" className="min-h-[120px]" />

              {payError && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{payError}</div>
              )}

              <button
                type="submit"
                disabled={paying}
                className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {paying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  `Pagar ${formatted}`
                )}
              </button>

              <p className="text-xs text-gray-400 text-center">Pago seguro procesado por Stripe</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
