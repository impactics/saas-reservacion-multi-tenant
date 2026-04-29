/**
 * Configuración de NextAuth / Auth.js
 *
 * Niveles de acceso:
 *  1. SUPERADMIN  — emails en ADMIN_EMAILS (env var, separados por coma)
 *                   Pueden ver y gestionar CUALQUIER organización.
 *                   No necesitan un registro en `professionals`.
 *
 *  2. ORG ADMIN   — debe existir en `professionals` con ese email y active=true.
 *                   Solo ven su propia organización.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

// Extend session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      organizationId: string; // 'superadmin' | cuid
      isSuperAdmin: boolean;
    };
  }
  interface User {
    organizationId?: string;
    isSuperAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
    isSuperAdmin?: boolean;
  }
}

/** Emails con acceso total — leer desde variable de entorno */
function getSuperAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId:     process.env.AUTH_GOOGLE_ID     ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),

    CredentialsProvider({
      name: "Email y contraseña",
      credentials: {
        email:    { label: "Email",      type: "email"    },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase();

        // Superadmin por credenciales (poco común, pero por si acaso)
        if (getSuperAdminEmails().includes(email)) {
          return {
            id:             "superadmin",
            name:           "Super Admin",
            email:          credentials.email,
            organizationId: "superadmin",
            isSuperAdmin:   true,
          };
        }

        // Org admin: buscar en professionals
        const prof = await prisma.professional.findFirst({
          where: { email, active: true },
          include: { organization: true },
        });
        if (!prof) return null;

        // TODO produccion: reemplazar con bcrypt.compare(credentials.password, prof.passwordHash)
        return {
          id:             prof.id,
          name:           prof.name,
          email:          prof.email ?? "",
          organizationId: prof.organizationId,
          isSuperAdmin:   false,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      const email = (user.email ?? "").toLowerCase();

      // 1. Superadmin — acceso inmediato
      if (getSuperAdminEmails().includes(email)) {
        user.organizationId = "superadmin";
        user.isSuperAdmin   = true;
        return true;
      }

      // 2. Org admin — debe existir en professionals
      const prof = await prisma.professional.findFirst({
        where: { email, active: true },
      });
      if (!prof) return "/login?error=unauthorized";

      user.organizationId = prof.organizationId;
      user.isSuperAdmin   = false;
      return true;
    },

    async jwt({ token, user }) {
      if (user?.organizationId) token.organizationId = user.organizationId;
      if (user?.isSuperAdmin !== undefined) token.isSuperAdmin = user.isSuperAdmin;
      return token;
    },

    async session({ session, token }) {
      session.user.organizationId = token.organizationId ?? "";
      session.user.isSuperAdmin   = token.isSuperAdmin   ?? false;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error:  "/login",
  },

  session: { strategy: "jwt" },
};
