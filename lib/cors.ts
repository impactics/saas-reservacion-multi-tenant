import { NextResponse } from "next/server";

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
