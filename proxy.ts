/**
 * proxy.ts — middleware CORS
 *
 * CORS solo se aplica a rutas públicas de la API.
 * Se restringe a orígenes explícitamente permitidos vía variable de entorno
 * (ALLOWED_ORIGINS) en lugar de reflejar ciegamente el header Origin.
 *
 * Formato ALLOWED_ORIGINS: URLs separadas por coma.
 * Ejemplo: https://mi-ecommerce.com,https://admin.mi-ecommerce.com
 */

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API =
  /^\/api\/[^\/]+\/(services|availability|bookings|professionals|checkout)/;

// Leer orígenes permitidos una sola vez al arrancar
function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const origins = raw
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);
  return new Set(origins);
}

const ALLOWED_ORIGINS = getAllowedOrigins();

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  // Siempre permitir el mismo dominio (Vercel preview URLs, etc.)
  const appUrl = (process.env.NEXTAUTH_URL ?? "").toLowerCase();
  if (appUrl && origin.toLowerCase() === appUrl) return true;
  return ALLOWED_ORIGINS.has(origin.toLowerCase());
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // Preflight CORS — solo para rutas públicas de la API
  if (request.method === "OPTIONS" && PUBLIC_API.test(pathname)) {
    if (!isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin!, // ya validado arriba
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  // Para peticiones normales (no preflight) en rutas públicas,
  // agregar el header ACAO si el origen está permitido
  const response = NextResponse.next();
  if (PUBLIC_API.test(pathname) && isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
