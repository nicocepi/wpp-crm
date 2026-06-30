"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { readFlowState, ATTENTION_LABEL, URGENT_LABEL } from "@/lib/types";
import type { Message } from "@/lib/types";

export type AgentActionResult =
  | { ok: true; message?: Message }
  | { ok: false; error: string };

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/** Devuelve el id de una label del tenant por nombre; la crea si no existe. */
async function getLabelId(
  supabase: SupaClient,
  tenantId: string,
  name: string,
  color: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("labels")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created } = await supabase
    .from("labels")
    .insert({ tenant_id: tenantId, name, color })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * Envía un mensaje como agente humano por la Cloud API y lo persiste como
 * outbound. Respeta RLS: el contacto/mensaje deben pertenecer al tenant del
 * usuario logueado. El token de Meta es server-only.
 */
export async function sendAgentMessage(
  contactId: string,
  text: string,
): Promise<AgentActionResult> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Mensaje vacío" };

  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) return { ok: false, error: "Falta WHATSAPP_API_TOKEN en el CRM" };

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Sin tenant" };

  const supabase = await createClient();

  // El contacto debe ser del tenant (RLS lo garantiza igual).
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone, tenant_id")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

  // Enviar a Meta Graph API.
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${tenant.whatsapp_phone_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: contact.phone,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j?.error?.message ?? detail;
    } catch {
      /* noop */
    }
    return { ok: false, error: `Meta: ${detail}` };
  }

  // Persistir el outbound (RLS via sesión).
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      tenant_id: tenant.id,
      contact_id: contactId,
      direction: "outbound",
      content: body,
      message_type: "text",
      sent_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  // Reflejar último mensaje en el contacto (preview).
  await supabase
    .from("contacts")
    .update({ last_message_preview: body, last_message_at: new Date().toISOString() })
    .eq("id", contactId);

  return { ok: true, message: inserted as Message };
}

/**
 * Activa/desactiva el handoff (humano al control) en contacts.flow_state.
 * Al liberar, resetea la sesión de menú (current_menu=null) para que el
 * próximo mensaje del cliente reinicie el bot desde la bienvenida.
 */
export async function setHandoff(
  contactId: string,
  on: boolean,
): Promise<AgentActionResult> {
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, flow_state")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

  const current = readFlowState(contact);
  // Al reactivar el bot hacemos reset completo de la sesión: sin handoff, sin
  // menú activo, sin mute del día ni urgencia, para que el próximo mensaje
  // muestre la bienvenida.
  const next = on
    ? { ...current, handoff: true }
    : {
        ...current,
        handoff: false,
        current_menu: null,
        muted_date: null,
        urgent: false,
      };

  const { error } = await supabase
    .from("contacts")
    .update({ flow_state: next })
    .eq("id", contactId);

  if (error) return { ok: false, error: error.message };

  // Sincroniza labels automáticas. Tomar control: agrega "Necesita agente".
  // Reactivar: quita "Necesita agente" y "Urgente".
  const tenant = await getCurrentTenant();
  if (tenant) {
    const attentionId = await getLabelId(
      supabase,
      tenant.id,
      ATTENTION_LABEL,
      "#f59e0b",
    );
    if (on) {
      if (attentionId)
        await supabase
          .from("contact_labels")
          .upsert(
            { contact_id: contactId, label_id: attentionId },
            { onConflict: "contact_id,label_id", ignoreDuplicates: true },
          );
    } else {
      const urgentId = await getLabelId(
        supabase,
        tenant.id,
        URGENT_LABEL,
        "#ef4444",
      );
      const toRemove = [attentionId, urgentId].filter(Boolean) as string[];
      if (toRemove.length > 0)
        await supabase
          .from("contact_labels")
          .delete()
          .eq("contact_id", contactId)
          .in("label_id", toRemove);
    }
  }

  return { ok: true };
}
