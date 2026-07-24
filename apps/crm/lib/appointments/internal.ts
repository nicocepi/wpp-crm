import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helpers para los endpoints internos (máquina-a-máquina) que consume n8n en el
 * flujo de turnos por WhatsApp. Se protegen con un secreto compartido
 * (APPOINTMENTS_INTERNAL_SECRET), mismo patrón que /api/handoff-alert.
 * El tenant llega explícito en el body y se valida contra la tabla tenants.
 */

export function checkSecret(req: Request): boolean {
  const secret = process.env.APPOINTMENTS_INTERNAL_SECRET;
  return !!secret && req.headers.get("x-appointment-secret") === secret;
}

export function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Cliente service-role (bypassa RLS): el aislamiento lo garantiza el filtro
 *  explícito por tenant_id en cada query + la validación de abajo. */
export function adminClient() {
  return createAdminClient();
}

/** Verifica que el tenant exista y tenga el módulo de turnos habilitado. */
export async function assertModuleEnabled(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase
    .from("appointment_settings")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data || !data.enabled) return { ok: false, error: "module_disabled" };
  return { ok: true };
}
