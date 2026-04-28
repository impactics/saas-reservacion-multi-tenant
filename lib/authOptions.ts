import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Soporte para super-admin por variables de entorno
        // (útil para el primer acceso sin necesidad de DB)
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (
          adminEmail &&
          adminPassword &&
          credentials.email === adminEmail &&
          credentials.password === adminPassword
        ) {
          return {
            id: "env-admin",
            email: adminEmail,
            name: "Super Admin",
            role: "superadmin",
          };
        }

        // TODO: cuando exista un modelo AdminUser en Prisma, descomentar:
        // const user = await prisma.adminUser.findUnique({
        //   where: { email: credentials.email },
        // });
        // if (!user) return null;
        // const valid = await compare(credentials.password, user.passwordHash);
        // if (!valid) return null;
        // return { id: user.id, email: user.email, name: user.name };

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};
