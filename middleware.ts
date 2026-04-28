import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API = /^\/api\/[^\/]+\/(services|availability|bookings|professionals|checkout)/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // Preflight CORS — responder sin autenticar
  if (request.method === "OPTIONS" && PUBLIC_API.test(pathname)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin ?? "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
