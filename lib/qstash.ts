import { Client } from "@upstash/qstash";
import { Receiver } from "@upstash/qstash";

if (!process.env.QSTASH_TOKEN) {
  throw new Error("QSTASH_TOKEN env var is missing");
}

export const qstash = new Client({ token: process.env.QSTASH_TOKEN });

/**
 * Receiver para verificar firma de webhooks QStash en los job-handlers.
 * Úsalo en cada route.ts de /api/jobs/* para verificar que el request
 * viene efectivamente de QStash.
 */
export const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
});

/**
 * Publica un mensaje en QStash hacia una URL interna de la app.
 * @param path  - ruta relativa, ej: "/api/jobs/notify-whatsapp"
 * @param body  - payload serializable
 * @param delay - delay en segundos (opcional)
 */
export async function publishJob<T = unknown>({
  path,
  body,
  delaySeconds,
}: {
  path: string;
  body: T;
  delaySeconds?: number;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL env var is missing");

  return qstash.publishJSON({
    url: `${baseUrl}${path}`,
    body,
    ...(delaySeconds ? { delay: delaySeconds } : {}),
  });
}
