"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserActionResult = { ok: true } | { ok: false; error: string };

/**
 * Alta de un usuario member en un tenant. Crea el usuario de Auth (o reusa el
 * existente) y lo asocia al tenant via profiles. Solo admin.
 */
export async function createTenantUser(
  tenantId: string,
  email: string,
): Promise<UserActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { ok: false, error: "Email invalido" };

  const admin = createAdminClient();

  // Crear el usuario de Auth (email confirmado -> entra por magic link).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: clean,
    email_confirm: true,
  });

  let userId = created?.user?.id;
  if (createErr || !userId) {
    // Si ya existe, buscarlo por email para reasignarlo.
    const { data: list } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    userId = list?.users.find((u) => u.email?.toLowerCase() === clean)?.id;
    if (!userId) {
      return { ok: false, error: createErr?.message ?? "No se pudo crear" };
    }
  }

  const { error: pErr } = await admin
    .from("profiles")
    .upsert(
      { user_id: userId, tenant_id: tenantId, role: "member" },
      { onConflict: "user_id" },
    );
  if (pErr) return { ok: false, error: pErr.message };

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
