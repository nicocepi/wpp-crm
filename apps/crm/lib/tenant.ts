import { createClient } from "@/lib/supabase/server";
import type { Tenant } from "@/lib/types";

export type Role = "member" | "admin";

export type CurrentProfile = {
  userId: string;
  role: Role;
  tenant: Tenant | null;
};

/**
 * Perfil del usuario logueado: rol + tenant (via profiles). null si no hay sesion.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // select("*") (no "role") para no romper si aun no se corrio admin.sql:
  // antes de la migracion la columna role no existe y se asume "member".
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { userId: user.id, role: "member", tenant: null };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", profile.tenant_id)
    .single();

  return {
    userId: user.id,
    role: profile.role === "admin" ? "admin" : "member",
    tenant: tenant ?? null,
  };
}

/**
 * Devuelve el tenant del usuario logueado (via profiles). null si no hay
 * sesion o el usuario no esta linkeado a ningun tenant.
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const profile = await getCurrentProfile();
  return profile?.tenant ?? null;
}

/** ¿El usuario logueado es admin? */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}
