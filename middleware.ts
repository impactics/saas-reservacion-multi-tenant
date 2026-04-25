import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

/**
 * Rate limit atómico usando pipeline Redis.
 * Evita la race condition entre incr + expire.
 */
async function rateLimit(
  ip: string,
  key: string,
  max: number,
  windowSec: number
) {
  const redisKey = `rl:${key}:${ip}`;
  const [count] = (await redis
    .pipeline()
    .incr(redisKey)
    .expire(redisKey, windowSec)
    .exec()) as [number, number];
  return count <= max;
}

export async function middleware(req: NextRequest) {
  // ─────────────────────────────────────────────────────────────────
  // PATCH CVE-2025-29927 — Next.js middleware authorization bypass
  // https://github.com/advisories/GHSA-f82v-jwr5-mffw
  // Bloquear cualquier request que incluya el header de subrequest
  // interno que permite saltarse el middleware completamente.
  // ─────────────────────────────────────────────────────────────────
  if (req.headers.get("x-middleware-subrequest")) {
    return new NextResponse(null, { status: 403 });
  }

  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limit en POST /api/[slug]/bookings — max 10 reservas/min por IP
  if (pathname.match(/^\/api\/[^/]+\/bookings$/) && req.method === "POST") {
    const allowed = await rateLimit(ip, "bookings", 10, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes, intenta en un momento" },
        { status: 429 }
      );
    }
  }

  // Rate limit general en /api/[slug]/* — max 120 req/min por IP
  if (pathname.match(/^\/api\/[^/]+\//) && req.method !== "OPTIONS") {
    const allowed = await rateLimit(ip, "api", 120, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes" },
        { status: 429 }
      );
    }
  }

  // Rate limit en webhook de pagos — evitar flood de requests maliciosas
  if (pathname === "/api/webhooks/payment" && req.method === "POST") {
    const allowed = await rateLimit(ip, "webhook-payment", 30, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes" },
        { status: 429 }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Proteger rutas /admin/* — verificar JWT real firmado con NEXTAUTH_SECRET
  // ANTES: solo verificaba existencia de cookie (trivialmente bypasseable)
  // AHORA: getToken() verifica la firma criptográfica del JWT
  // ─────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Proteger job-handlers — solo QStash puede llamarlos directamente
  // La verificación criptográfica real ocurre dentro de cada handler
  // con qstashReceiver.verify(). Este check es una capa extra de defensa.
  if (pathname.startsWith("/api/jobs/")) {
    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
