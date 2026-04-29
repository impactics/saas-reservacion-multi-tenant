/**
 * Niveles de acceso:
 *  SUPERADMIN — emails en ADMIN_EMAILS, acceso total
 *  ORG ADMIN  — professional activo con passwordHash en BD
 */
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/schemas";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      organizationId: string;
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
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        if (getSuperAdminEmails().includes(email)) {
          const hash = process.env.SUPERADMIN_PASSWORD ?? "";
          if (!hash) {
            console.error("[auth] SUPERADMIN_PASSWORD no configurado");
            return null;
          }
          if (!(await compare(password, hash))) return null;
          return { id: "superadmin", name: "Super Admin", email, organizationId: "superadmin", isSuperAdmin: true };
        }

        const prof = await prisma.professional.findFirst({
          where:  { email, active: true },
          select: { id: true, name: true, email: true, organizationId: true, passwordHash: true },
        });
        if (!prof?.passwordHash) return null;
        if (!(await compare(password, prof.passwordHash))) return null;

        return { id: prof.id, name: prof.name, email: prof.email ?? "", organizationId: prof.organizationId, isSuperAdmin: false };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = (user.email ?? "").toLowerCase();

      if (getSuperAdminEmails().includes(email)) {
        user.organizationId = "superadmin";
        user.isSuperAdmin   = true;
        return true;
      }

      const prof = await prisma.professional.findFirst({ where: { email, active: true } });
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

  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
};
