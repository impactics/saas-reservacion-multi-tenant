import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL:               z.string().url(),
  NEXTAUTH_SECRET:            z.string().min(32),
  NEXTAUTH_URL:               z.string().url(),
  AUTH_GOOGLE_ID:             z.string().min(1),
  AUTH_GOOGLE_SECRET:         z.string().min(1),
  UPSTASH_REDIS_REST_URL:     z.string().url(),
  UPSTASH_REDIS_REST_TOKEN:   z.string().min(1),
  QSTASH_TOKEN:               z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY:    z.string().min(1),
  ADMIN_EMAILS:               z.string().min(1),
  PAYPAL_CLIENT_ID:           z.string().optional(),
  PAYPAL_CLIENT_SECRET:       z.string().optional(),
  PAYPAL_WEBHOOK_ID:          z.string().optional(),
  PAYPAL_ENV:                 z.enum(["sandbox", "production"]).default("sandbox"),
  NEXT_PUBLIC_APP_URL:        z.string().url().optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const msg = Object.entries(errors).map(([k, v]) => `  ❌ ${k}: ${v?.join(", ")}`).join("\n");
    console.error(`\n🚨 Variables de entorno inválidas:\n${msg}\n`);
    if (process.env.NODE_ENV === "production") throw new Error("Variables de entorno inválidas.");
  }
  return result.data ?? (process.env as unknown as z.infer<typeof envSchema>);
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
