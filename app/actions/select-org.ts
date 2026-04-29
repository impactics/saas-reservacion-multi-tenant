"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function selectOrg(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) return;

  const slug = formData.get("slug") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/admin";

  const cookieStore = await cookies();
  cookieStore.set("sa-org", slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24h
  });

  redirect(redirectTo);
}
