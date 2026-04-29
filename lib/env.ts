/**
 * lib/env.ts
 *
 * Validación de variables de entorno al arranque con Zod.
 * Si falta alguna variable crítica, el proceso falla rápido con un mensaje claro.
 * Importar este archivo al inicio de lib/auth.ts, lib/prisma.ts, etc.
 */

import { z } from "zod";

const envSchema = z.object({
  // Base de datos
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una URL válida"),

  // Auth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET debe tener al menos 32 caracteres"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL debe ser una URL válida"),

  // Google OAuth
  AUTH_GOOGLE_ID: z.string().min(1, "AUTH_GOOGLE_ID requerido"),
  AUTH_GOOGLE_SECRET: z.string().min(1, "AUTH_GOOGLE_SECRET requerido"),

  // Redis (Upstash)
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url("UPSTASH_REDIS_REST_URL debe ser una URL válida"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_TOKEN requerido"),

  // QStash
  QSTASH_TOKEN: z.string().min(1, "QSTASH_TOKEN requerido"),
  QSTASH_CURRENT_SIGNING_KEY: z
    .string()
    .min(1, "QSTASH_CURRENT_SIGNING_KEY requerido"),
  QSTASH_NEXT_SIGNING_KEY: z
    .string()
    .min(1, "QSTASH_NEXT_SIGNING_KEY requerido"),

  // Superadmin
  ADMIN_EMAILS: z.string().min(1, "ADMIN_EMAILS requerido"),

  // PayPal (opcionales en dev, requeridos en producción)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

  // App URL
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL debe ser una URL válida")
    .optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  ❌ ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    console.error(
      `\n🚨 Variables de entorno inválidas o faltantes:\n${messages}\n`
    );

    // En producción, fallar rápido. En desarrollo, solo advertir.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Variables de entorno inválidas. Revisar logs para detalles."
      );
    }
  }

  return result.data ?? (process.env as unknown as z.infer<typeof envSchema>);
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
