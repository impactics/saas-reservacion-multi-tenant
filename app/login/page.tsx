/**
 * Página de login del panel admin
 * - Google OAuth
 * - Email + contraseña (fallback)
 *
 * useSearchParams() MUST be inside a <Suspense> boundary when the page
 * is statically rendered (Next.js App Router requirement).
 */

import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex items-center justify-center">
            <span className="text-sm text-gray-400">Cargando...</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
