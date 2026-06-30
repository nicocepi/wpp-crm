"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";

export type SettingsState = { ok?: boolean; error?: string };

/** Validación mínima del árbol de flujo (modo menú). */
function validateFlowDefinition(raw: string): { value: unknown } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "El flujo no es JSON válido" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "El flujo debe ser un objeto JSON" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.start !== "string") {
    return { error: "Falta 'start' (id del nodo inicial)" };
  }
  if (!obj.nodes || typeof obj.nodes !== "object") {
    return { error: "Falta 'nodes' (objeto de nodos)" };
  }
  if (!(obj.start in (obj.nodes as Record<string, unknown>))) {
    return { error: `El nodo inicial '${obj.start}' no existe en 'nodes'` };
  }
  return { value: parsed };
}

export async function saveBotConfig(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sin sesion" };

  // tenant_id objetivo: el del form (admin editando otro tenant) o el propio.
  const formTenantId = String(formData.get("tenant_id") ?? "").trim();
  const targetTenantId = formTenantId || profile.tenant?.id;
  if (!targetTenantId) return { error: "Sin tenant" };

  // Solo el admin puede editar un tenant distinto al propio (la RLS lo refuerza).
  const isOwn = targetTenantId === profile.tenant?.id;
  if (!isOwn && profile.role !== "admin") {
    return { error: "No autorizado" };
  }

  const enabled = formData.get("enabled") === "on";
  const systemPrompt = String(formData.get("system_prompt") ?? "").trim();
  const delayRaw = Number(formData.get("reply_delay_seconds"));
  const replyDelay = Number.isFinite(delayRaw)
    ? Math.max(0, Math.min(60, Math.round(delayRaw)))
    : 2;

  const flowType = formData.get("flow_type") === "menu" ? "menu" : "ai";
  const flowDefRaw = String(formData.get("flow_definition") ?? "").trim();

  let flowDefinition: unknown = null;
  if (flowType === "menu") {
    if (!flowDefRaw) return { error: "El modo menú requiere un flujo (JSON)" };
    const result = validateFlowDefinition(flowDefRaw);
    if ("error" in result) return { error: result.error };
    flowDefinition = result.value;
  } else if (flowDefRaw) {
    // Modo IA: si dejaron JSON cargado, lo conservamos si es válido (sin exigirlo).
    try {
      flowDefinition = JSON.parse(flowDefRaw);
    } catch {
      flowDefinition = null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bot_configs").upsert(
    {
      tenant_id: targetTenantId,
      enabled,
      system_prompt: systemPrompt || null,
      reply_delay_seconds: replyDelay,
      flow_type: flowType,
      flow_definition: flowDefinition as never,
    },
    { onConflict: "tenant_id" },
  );

  if (error) return { error: error.message };
  return { ok: true };
}
