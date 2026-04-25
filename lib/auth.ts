/**
 * Configuración de NextAuth / Auth.js
 *
 * Proveedores:
 *   - Google OAuth (para login de admins)
 *   - CredentialsProvider (email + password como fallback)
 *
 * La sesión incluye organizationId del admin para que las rutas
 * del panel puedan hacer queries filtradas por org.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Validación temprana de secret — falla en arranque si no está definido
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "[auth] NEXTAUTH_SECRET no está definido. " +
      "Generar con: openssl rand -base64 32"
  );
}

// Extend session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      organizationId: string;
    };
  }
  interface User {
    organizationId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),

    CredentialsProvider({
      name: "Email y contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Buscar profesional activo por email
        const prof = await prisma.professional.findFirst({
          where: { email: credentials.email, active: true },
          select: {
            id: true,
            name: true,
            email: true,
            organizationId: true,
            passwordHash: true,
          },
          include: { organization: true },
        });
        if (!prof) return null;

        // Sin hash registrado → no se permite login por credenciales
        if (!prof.passwordHash) return null;

        // Verificar contraseña con bcrypt (tiempo constante — evita timing attacks)
        const valid = await bcrypt.compare(
          credentials.password,
          prof.passwordHash
        );
        if (!valid) return null;

        return {
          id: prof.id,
          name: prof.name,
          email: prof.email ?? "",
          organizationId: prof.organizationId,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Para Google OAuth: verificar que el email del admin existe en la BD
      if (account?.provider === "google") {
        const prof = await prisma.professional.findFirst({
          where: { email: user.email ?? "", active: true },
        });
        if (!prof) return "/login?error=unauthorized";
        user.organizationId = prof.organizationId;
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user?.organizationId) {
        token.organizationId = user.organizationId;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.organizationId) {
        session.user.organizationId = token.organizationId;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: { strategy: "jwt" },
};
