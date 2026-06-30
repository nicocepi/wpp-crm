"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, IMPERSONATE_COOKIE } from "@/lib/tenant";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Admin: "ingresar como" un tenant (impersonacion). Guarda una cookie con el
 * tenant y manda a Contactos, donde ve/usa lo mismo que un member.
 */
export async function impersonateTenant(formData: FormData) {
  if (!(await isAdmin())) return;
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) return;

  (await cookies()).set(IMPERSONATE_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
  redirect("/contacts");
}

/** Sale del modo impersonacion. */
export async function stopImpersonating() {
  (await cookies()).delete(IMPERSONATE_COOKIE);
  redirect("/tenants");
}
