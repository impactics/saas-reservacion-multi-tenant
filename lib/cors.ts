/**
 * cors.ts — Helper para agregar headers CORS a las respuestas de la API pública.
 *
 * La variable ECOMMERCE_ORIGINS acepta una lista separada por comas:
 *   ECOMMERCE_ORIGINS=https://dramariabelencerda.com,https://otro-doctor.com
 * Si no está definida, permite cualquier origen (*) — útil en desarrollo.
 */

import { NextRequest, NextResponse } from "next/server";

export function corsHeaders(origin: string | null, allowedOrigins: string[]) {
  const allowed =
    !origin ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes("*") ||
    allowedOrigins.includes(origin);

  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function withCors(
  response: NextResponse,
  origin: string | null,
  allowedOrigins: string[] = ["*"]
): NextResponse {
  const headers = corsHeaders(origin, allowedOrigins);
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

/**
 * Lee ECOMMERCE_ORIGINS del entorno y devuelve el array de orígenes permitidos.
 * Uso: const origins = getAllowedOrigins();
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ECOMMERCE_ORIGINS ?? "";
  if (!raw) return ["*"];
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

/**
 * Respuesta preflight OPTIONS — úsala en TODAS las rutas públicas.
 * Ejemplo:
 *   export function OPTIONS(req: NextRequest) { return corsOptions(req); }
 */
export function corsOptions(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const res = new NextResponse(null, { status: 204 });
  return withCors(res as NextResponse, origin, getAllowedOrigins());
}
