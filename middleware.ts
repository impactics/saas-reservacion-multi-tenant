import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Dominios permitidos para consumir la API (agrega el ecommerce de cada cliente)
const ALLOWED_ORIGINS = [
  "http://localhost:3001",        // desarrollo local del cliente
  "https://mi-ecommerce.com",     // ecommerce del cliente en producción
  "https://www.mi-ecommerce.com",
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function rateLimit(ip: string, key: string, max: number, windowSec: number) {
  const redisKey = `rl:${key}:${ip}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);
  return count <= max;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const origin = req.headers.get("origin");

  // Responder preflight OPTIONS para CORS
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // Rate limit en POST /api/[slug]/bookings
  if (pathname.match(/^\/api\/[^/]+\/bookings$/) && req.method === "POST") {
    const allowed = await rateLimit(ip, "bookings", 10, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes, intenta en un momento" },
        { status: 429, headers: getCorsHeaders(origin) }
      );
    }
  }

  // Rate limit general en /api/[slug]/*
  if (pathname.match(/^\/api\/[^/]+\//) && req.method !== "OPTIONS") {
    const allowed = await rateLimit(ip, "api", 120, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes" },
        { status: 429, headers: getCorsHeaders(origin) }
      );
    }
  }

  // Proteger rutas /admin/*
  if (pathname.startsWith("/admin")) {
    const session =
      req.cookies.get("next-auth.session-token") ??
      req.cookies.get("__Secure-next-auth.session-token");
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Proteger job-handlers — solo QStash
  if (pathname.startsWith("/api/jobs/")) {
    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  // Agregar headers CORS a todas las respuestas de /api/[slug]/*
  const response = NextResponse.next();
  if (pathname.match(/^\/api\/[^/]+\//)) {
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
