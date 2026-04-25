/**
 * lib/payphone.ts
 *
 * Utilidades para la pasarela Payphone (Ecuador).
 * https://developers.payphone.app/docs
 *
 * Payphone usa un modelo de "Link de pago" (buttonId):
 *   1. POST /api/button/Payments/link  → obtener un paymentUrl
 *   2. El cliente paga en la página de Payphone
 *   3. Payphone llama al callbackUrl (nuestro webhook) con el resultado
 *   4. Verificamos el pago con POST /api/button/Payments/verify
 *
 * Variables de entorno requeridas:
 *   PAYPHONE_APP_ID       - Token de autenticación ("Bearer <token>")
 *   PAYPHONE_TOKEN        - Token de firma para verificar callbacks
 */

const PAYPHONE_BASE = "https://pay.payphonetodoesposible.com";

export interface PayphoneCreateLinkParams {
  amount: number;           // en centavos (USD × 100)
  currency: string;         // USD
  bookingId: string;
  clientTransactionId: string;
  callbackUrl: string;
  cancellationUrl: string;
  reference: string;        // descripción visible al cliente
  email?: string;
  phoneNumber?: string;
}

export interface PayphoneLink {
  paymentId: number;
  paymentUrl: string;
}

/**
 * Crea un link de pago Payphone y devuelve { paymentId, paymentUrl }.
 */
export async function createPayphoneLink(
  params: PayphoneCreateLinkParams
): Promise<PayphoneLink> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";

  const body = {
    amount: params.amount,           // centavos
    amountWithoutTax: params.amount, // sin impuestos — ajustar si aplica IVA
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appId}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Payphone createLink error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    paymentId: data.paymentId,
    paymentUrl: data.payWithCard ?? data.paymentUrl ?? data.link,
  };
}

/**
 * Verifica un pago Payphone consultando la API.
 * Retorna true si el pago está aprobado (transactionStatus === 3).
 */
export async function verifyPayphonePayment(
  id: string,
  clientTransactionId: string
): Promise<{ approved: boolean; transactionStatus: number; paymentId: string }> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";

  const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appId}`,
    },
    body: JSON.stringify({ id, clientTransactionId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Payphone verify error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // transactionStatus: 3 = Aprobado, 2 = Rechazado, 1 = Cancelado
  return {
    approved: data.transactionStatus === 3,
    transactionStatus: data.transactionStatus,
    paymentId: String(data.id ?? id),
  };
}
