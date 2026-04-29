const PAYPHONE_BASE = "https://pay.payphonetodoesposible.com";

export interface PayphoneCreateLinkParams {
  amount:              number; // centavos (USD × 100)
  currency:            string;
  bookingId:           string;
  clientTransactionId: string;
  callbackUrl:         string;
  cancellationUrl:     string;
  reference:           string;
  email?:              string;
  phoneNumber?:        string;
}

export interface PayphoneLink {
  paymentId:  number;
  paymentUrl: string;
}

export async function createPayphoneLink(params: PayphoneCreateLinkParams): Promise<PayphoneLink> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";
  const body = {
    amount:              params.amount,
    amountWithoutTax:    params.amount,
    currency:            params.currency,
    clientTransactionId: params.clientTransactionId,
    responseUrl:         params.callbackUrl,
    cancellationUrl:     params.cancellationUrl,
    reference:           params.reference,
    ...(params.email       && { email:       params.email }),
    ...(params.phoneNumber && { phoneNumber: params.phoneNumber }),
  };

  const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/link`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Payphone createLink ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { paymentId: data.paymentId, paymentUrl: data.payWithCard ?? data.paymentUrl ?? data.link };
}

export async function verifyPayphonePayment(
  id: string,
  clientTransactionId: string
): Promise<{ approved: boolean; transactionStatus: number; paymentId: string }> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";
  const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/verify`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
    body:    JSON.stringify({ id, clientTransactionId }),
  });
  if (!res.ok) throw new Error(`Payphone verify ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { approved: data.transactionStatus === 3, transactionStatus: data.transactionStatus, paymentId: String(data.id ?? id) };
}

/**
 * Reembolso total o parcial. Payphone debe tener habilitada la funcionalidad.
 * @param amountCents — si es undefined, reembolso total
 */
export async function refundPayphonePayment(paymentId: string, amountCents?: number): Promise<{ success: boolean; error?: string }> {
  const appId = process.env.PAYPHONE_APP_ID ?? "";
  const body: Record<string, unknown> = { transactionId: paymentId };
  if (amountCents !== undefined) body.amount = amountCents;

  try {
    const res = await fetch(`${PAYPHONE_BASE}/api/button/Payments/refund`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${appId}` },
      body:    JSON.stringify(body),
    });
    if (!res.ok) return { success: false, error: `Payphone refund ${res.status}: ${await res.text()}` };
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Calcula el reembolso según política de la organización.
 * Retorna { refundCents, pct } — 0 si no aplica.
 */
export function calcRefundAmount(
  totalCents: number,
  horasHastaLaCita: number,
  refundHours: number,
  partialHours: number,
  partialPct: number
): { refundCents: number; pct: number } {
  if (horasHastaLaCita >= refundHours) return { refundCents: totalCents, pct: 100 };
  if (horasHastaLaCita >= partialHours) return { refundCents: Math.floor((totalCents * partialPct) / 100), pct: partialPct };
  return { refundCents: 0, pct: 0 };
}
