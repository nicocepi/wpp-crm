"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserActionResult = { ok: true } | { ok: false; error: string };

/** Roles asignables desde el ABM de un tenant (el 'admin' global no se crea acá). */
export type TenantRole = "member" | "tenant_admin";

/**
 * Alta de un usuario en un tenant. Crea el usuario de Auth (o reusa el
 * existente) y lo asocia al tenant via profiles. Solo admin.
 * Modelo: 1 usuario = 1 tenant. Si el email YA pertenece a otro tenant (o es el
 * admin global), NO se reasigna: se rechaza con un aviso.
 */
export async function createTenantUser(
  tenantId: string,
  email: string,
  name?: string,
  role: TenantRole = "member",
): Promise<UserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { ok: false, error: "Email invalido" };
  const displayName = (name ?? "").trim() || null;
  const safeRole: TenantRole = role === "tenant_admin" ? "tenant_admin" : "member";

  const admin = createAdminClient();

  // Crear el usuario de Auth (email confirmado -> entra por magic link).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: clean,
    email_confirm: true,
  });

  let userId = created?.user?.id;
  if (createErr || !userId) {
    // Ya existe en Auth: buscarlo por email (NO reasignar sin validar).
    const { data: list } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    userId = list?.users.find((u) => u.email?.toLowerCase() === clean)?.id;
    if (!userId) {
      return { ok: false, error: createErr?.message ?? "No se pudo crear" };
    }
  }

  // Validación de duplicado: si ya tiene un profile, no reasignar entre tenants.
  const { data: existing } = await admin
    .from("profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    if (existing.role === "admin") {
      return { ok: false, error: "Ese email es del administrador global." };
    }
    if (existing.tenant_id === tenantId) {
      return { ok: false, error: "Ese usuario ya existe en este cliente." };
    }
    return {
      ok: false,
      error:
        "Ese email ya pertenece a otro cliente. No se puede asignar a dos clientes.",
    };
  }

  const { error: pErr } = await admin.from("profiles").insert({
    user_id: userId,
    tenant_id: tenantId,
    role: safeRole,
    display_name: displayName,
  });
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath(`/tenants/${tenantId}/users`);
  return { ok: true };
}

/** Cambia el rol de un usuario del tenant (member <-> tenant_admin). Solo admin. */
export async function setTenantUserRole(
  tenantId: string,
  userId: string,
  role: TenantRole,
): Promise<UserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  const safeRole: TenantRole = role === "tenant_admin" ? "tenant_admin" : "member";

  const admin = createAdminClient();
  // Solo dentro del tenant y sin tocar al admin global.
  const { data, error } = await admin
    .from("profiles")
    .update({ role: safeRole })
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .neq("role", "admin")
    .select("user_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No se pudo cambiar el rol" };
  }

  revalidatePath(`/tenants/${tenantId}/users`);
  return { ok: true };
}

/** Baja: elimina el usuario de Auth (cascade borra su profile). Solo admin. */
export async function deleteTenantUser(
  tenantId: string,
  userId: string,
): Promise<UserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tenants/${tenantId}/users`);
  return { ok: true };
}
