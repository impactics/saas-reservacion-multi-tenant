import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

/**
 * Rate limit sencillo en el middleware (Edge runtime).
 * Bloquea IPs que superen el umbral en rutas de API pública.
 */
async function rateLimit(ip: string, key: string, max: number, windowSec: number) {
  const redisKey = `rl:${key}:${ip}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);
  return count <= max;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

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

  // Proteger rutas /admin/* — requerir cookie de sesión
  if (pathname.startsWith("/admin")) {
    const session = req.cookies.get("next-auth.session-token") ??
      req.cookies.get("__Secure-next-auth.session-token");
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Proteger job-handlers — solo QStash puede llamarlos directamente
  if (pathname.startsWith("/api/jobs/")) {
    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
  ],
};
