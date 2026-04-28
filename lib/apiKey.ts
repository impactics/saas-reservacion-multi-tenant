import { createHash, randomBytes } from "crypto";
import prisma from "@/lib/prisma";

// Prefijo de las API keys del sistema
const KEY_PREFIX_TOKEN = "srs_pub_";

/**
 * Genera una nueva API key.
 * Retorna { raw, prefix, hash }
 * - raw:    la clave completa — mostrar UNA SOLA VEZ al usuario
 * - prefix: primeros chars — guardar en DB para identificar
 * - hash:   SHA-256 del raw — guardar en DB para verificar
 */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_PREFIX_TOKEN + randomBytes(32).toString("hex");
  const prefix = raw.slice(0, 16);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

/**
 * Verifica una API key entrante.
 * Devuelve { organizationId, slug } si es válida, null si no.
 */
export async function verifyApiKey(
  rawKey: string,
  origin: string | null
): Promise<{ organizationId: string; slug: string } | null> {
  if (!rawKey?.startsWith(KEY_PREFIX_TOKEN)) return null;

  const hash = createHash("sha256").update(rawKey).digest("hex");

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { organization: { select: { id: true, slug: true } } },
  });

  if (!key || !key.active) return null;

  // Validar origen CORS si hay origenes configurados
  if (key.allowedOrigins.length > 0 && origin) {
    const allowed = key.allowedOrigins.some((o) => o === origin || o === "*");
    if (!allowed) return null;
  }

  // Actualizar last_used_at en background
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { organizationId: key.organization.id, slug: key.organization.slug };
}
