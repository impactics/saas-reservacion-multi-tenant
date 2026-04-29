import { Client, Receiver } from "@upstash/qstash";

if (!process.env.QSTASH_TOKEN) throw new Error("QSTASH_TOKEN env var is missing");

export const qstash = new Client({ token: process.env.QSTASH_TOKEN });

// Verifica firma de webhooks QStash en /api/jobs/*
export const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
  nextSigningKey:    process.env.QSTASH_NEXT_SIGNING_KEY    ?? "",
});

export async function publishJob<T = unknown>({
  path,
  body,
  delaySeconds,
}: {
  path:          string;
  body:          T;
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
