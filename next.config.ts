import type { NextConfig } from "next";

const securityHeaders = [
  {
    // Previene clickjacking — la app no puede ser embebida en iframes externos
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Previene MIME-sniffing attacks
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Controla información enviada en el header Referer
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Fuerza HTTPS por 2 años, incluye subdominios
    // Solo activar en producción (Vercel lo maneja automáticamente)
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Restringe uso de APIs sensibles del browser
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    // CSP básico — ajustar según los recursos externos que uses
    // (Google Fonts, PayPal SDK, etc. deben agregarse aquí)
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.vercel-storage.com https://lh3.googleusercontent.com",
      "connect-src 'self' https://*.upstash.io https://api.resend.com",
      "frame-src https://www.paypal.com",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Habilitar React strict mode para detectar problemas en desarrollo
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Aplicar a todas las rutas
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  images: {
    // Dominios autorizados para next/image
    remotePatterns: [
      {
        // Vercel Blob Storage (logos de organizaciones)
        protocol: "https",
        hostname: "*.vercel-storage.com",
      },
      {
        // Google profile pictures (NextAuth Google OAuth)
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
