/**
 * lib/payphone.ts
 *
 * Utilidades para la pasarela Payphone (Ecuador).
 * https://developers.payphone.app/docs
 *
 * Variables de entorno requeridas:
 *   PAYPHONE_APP_ID   - Token de autenticación Bearer
 *   PAYPHONE_TOKEN    - Token de firma para verificar callbacks
 */

const PAYPHONE_BASE = "https://pay.payphonetodoesposible.com";

export interface PayphoneCreateLinkParams {
  amount: number;            // en centavos (USD × 100)
  currency: string;          // USD
  bookingId: string;
  clientTransactionId: string;
  callbackUrl: string;
  cancellationUrl: string;
  reference: string;
  email?: string;
  phoneNumber?: string;
}

export interface PayphoneLink {
  paymentId: number;
  paymentUrl: string;
}

export async function createPayphoneLink(
  params: PayphoneCreateLinkParams
): Promise<PayphoneLink> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";
  const body = {
    amount: params.amount,
    amountWithoutTax: params.amount,
    currency: params.currency,
    clientTransactionId: params.clientTransactionId,
    responseUrl: params.callbackUrl,
    cancellationUrl: params.cancellationUrl,
    reference: params.reference,
    ...(params.email && { email: params.email }),
    ...(params.phoneNumber && { phoneNumber: params.phoneNumber }),
  };

  const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Payphone createLink ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    paymentId: data.paymentId,
    paymentUrl: data.payWithCard ?? data.paymentUrl ?? data.link,
  };
}

export async function verifyPayphonePayment(
  id: string,
  clientTransactionId: string
): Promise<{ approved: boolean; transactionStatus: number; paymentId: string }> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";
  const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
    body: JSON.stringify({ id, clientTransactionId }),
  });
  if (!res.ok) throw new Error(`Payphone verify ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    approved: data.transactionStatus === 3,
    transactionStatus: data.transactionStatus,
    paymentId: String(data.id ?? id),
  };
}

/**
 * Solicita un reembolso total o parcial a Payphone.
 * @param paymentId          - ID de la transacción original (guardado en Booking.paymentId)
 * @param amountCents        - Monto a reembolsar en centavos. Si es undefined = reembolso total.
 * @returns true si el reembolso fue aceptado por Payphone.
 *
 * NOTA: Payphone debe tener habilitada la funcionalidad de reembolsos
 * en la cuenta. Contactar soporte@payphone.app para activarla.
 */
export async function refundPayphonePayment(
  paymentId: string,
  amountCents?: number
): Promise<{ success: boolean; error?: string }> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";

  const body: Record<string, unknown> = { transactionId: paymentId };
  if (amountCents !== undefined) body.amount = amountCents;

  try {
    const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Payphone refund ${res.status}: ${text}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Calcula el monto de reembolso en centavos según la política de la organización.
 * @param totalCents          Monto total pagado en centavos
 * @param horasHastaLaCita    Horas que faltan para la cita
 * @param refundHours         Umbral de reembolso total (ej: 24)
 * @param partialHours        Umbral de reembolso parcial (ej: 12)
 * @param partialPct          % de reembolso parcial (ej: 50)
 * @returns { refundCents, pct } — 0 si no aplica reembolso
 */
export function calcRefundAmount(
  totalCents: number,
  horasHastaLaCita: number,
  refundHours: number,
  partialHours: number,
  partialPct: number
): { refundCents: number; pct: number } {
  if (horasHastaLaCita >= refundHours) {
    return { refundCents: totalCents, pct: 100 };
  }
  if (horasHastaLaCita >= partialHours) {
    const refundCents = Math.floor((totalCents * partialPct) / 100);
    return { refundCents, pct: partialPct };
  }
  return { refundCents: 0, pct: 0 };
}
