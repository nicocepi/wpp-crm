import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Tenant } from "@/lib/types";

export type Role = "member" | "admin";

export const IMPERSONATE_COOKIE = "act_as_tenant";

export type CurrentProfile = {
  userId: string;
  role: Role;
  tenant: Tenant | null;
  /** El admin esta "viendo como" un tenant (impersonacion). */
  impersonating: boolean;
};

/**
 * Perfil del usuario logueado: rol + tenant (via profiles). null si no hay sesion.
 * Si es admin y hay cookie de impersonacion, el tenant pasa a ser el impersonado.
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

  const role: Role = profile?.role === "admin" ? "admin" : "member";

  // Tenant efectivo: el impersonado (solo admin) o el propio del profile.
  let tenantId: string | null = profile?.tenant_id ?? null;
  let impersonating = false;
  if (role === "admin") {
    const actAs = (await cookies()).get(IMPERSONATE_COOKIE)?.value;
    if (actAs) {
      tenantId = actAs;
      impersonating = true;
    }
  }

  let tenant: Tenant | null = null;
  if (tenantId) {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();
    tenant = data ?? null;
  }

  return { userId: user.id, role, tenant, impersonating };
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
