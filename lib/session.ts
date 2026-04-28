/**
 * Typed wrapper around getServerSession.
 * Use this instead of importing getServerSession directly in route handlers
 * so TypeScript always resolves Session with the augmented user type (organizationId).
 */
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";

export type { Session };

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions) as Promise<Session | null>;
}
