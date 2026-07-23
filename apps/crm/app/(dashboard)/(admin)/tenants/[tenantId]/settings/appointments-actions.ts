"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";

export type AppointmentsFlagState = { ok?: boolean; error?: string };

/**
 * Habilita/deshabilita el módulo de turnos para un tenant desde el panel
 * admin, sin necesidad de impersonarlo. Upsert parcial: solo toca `enabled`
 * (si ya existe configuración de turnos para el tenant, no pisa el resto de
 * sus valores; si no existe, la crea con los defaults de la tabla).
 */
export async function setAppointmentsEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<AppointmentsFlagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sin sesión" };
  if (profile.role !== "admin") return { error: "No autorizado" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_settings")
    .upsert({ tenant_id: tenantId, enabled }, { onConflict: "tenant_id" });
  if (error) return { error: error.message };

  revalidatePath(`/tenants/${tenantId}/settings`);
  return { ok: true };
}
