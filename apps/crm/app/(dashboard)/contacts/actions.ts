"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { readFlowState, ATTENTION_LABEL, URGENT_LABEL } from "@/lib/types";
import type { Message } from "@/lib/types";

/** Identidad del usuario logueado para el ownership del handoff.
 *  canOverride: puede tomar/liberar la conversación de OTRO agente
 *  (admin global o tenant_admin del tenant). */
async function currentAgent(): Promise<{
  userId: string;
  name: string;
  canOverride: boolean;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("user_id", user.id)
    .single();
  const name =
    (profile?.display_name && profile.display_name.trim()) ||
    user.email ||
    "Agente";
  const canOverride =
    profile?.role === "admin" || profile?.role === "tenant_admin";
  return { userId: user.id, name, canOverride };
}

/** Devuelve un mensaje de error si el agente NO puede responder esta
 *  conversación (no es el dueño ni tiene override), o null si puede. */
function ownershipError(
  contact: { handoff_by: string | null; handoff_by_name: string | null },
  agent: { userId: string; canOverride: boolean } | null,
): string | null {
  if (!agent) return "Sesión no válida";
  if (agent.canOverride) return null;
  if (!contact.handoff_by) return "Tomá el control primero para responder.";
  if (contact.handoff_by === agent.userId) return null;
  return `La está atendiendo ${contact.handoff_by_name ?? "otro agente"}.`;
}

export type AgentActionResult =
  | { ok: true; message?: Message }
  | { ok: false; error: string };

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
const ATTACH_BUCKET = "chat-attachments";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB (límite WhatsApp imagen)
const MAX_PDF_BYTES = 16 * 1024 * 1024; // 16MB (cap propio; WhatsApp permite hasta 100MB)

type AttachKind = "png" | "jpg" | "webp" | "pdf";

const ATTACH_META: Record<
  AttachKind,
  { mime: string; ext: string; waType: "image" | "document" }
> = {
  png: { mime: "image/png", ext: "png", waType: "image" },
  jpg: { mime: "image/jpeg", ext: "jpg", waType: "image" },
  webp: { mime: "image/webp", ext: "webp", waType: "image" },
  pdf: { mime: "application/pdf", ext: "pdf", waType: "document" },
};

/** Detecta el tipo por magic numbers (no confiar en file.type del cliente). */
function sniffAttachment(b: Uint8Array): AttachKind | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  )
    return "webp";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "pdf"; // %PDF
  return null;
}

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
    .select("id, phone, tenant_id, handoff_by, handoff_by_name")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

  // Ownership: solo el dueño del handoff (o un admin) puede responder.
  const agent = await currentAgent();
  const ownGuard = ownershipError(contact, agent);
  if (ownGuard) return { ok: false, error: ownGuard };

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

  let payload: {
    error?: { message?: string };
    messages?: { id?: string }[];
  } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* noop */
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Meta: ${payload?.error?.message ?? `HTTP ${res.status}`}`,
    };
  }

  // wamid de Meta -> dedupe del outbound ante reintentos.
  const wamid = payload?.messages?.[0]?.id ?? null;

  // Persistir el outbound (RLS via sesión).
  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      tenant_id: tenant.id,
      contact_id: contactId,
      whatsapp_message_id: wamid,
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

  revalidatePath("/contacts");
  return { ok: true, message: inserted as Message };
}

/**
 * Envía un adjunto (imagen o PDF) como agente por la Cloud API y lo persiste
 * como outbound. Sube el archivo al bucket privado bajo la sesión del usuario
 * (RLS, sin service role), y manda a Meta una URL firmada corta que Meta
 * descarga al instante. Devuelve el message con una signed URL para render.
 */
export async function sendAgentAttachment(
  contactId: string,
  formData: FormData,
): Promise<AgentActionResult & { signedUrl?: string }> {
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) return { ok: false, error: "Falta WHATSAPP_API_TOKEN en el CRM" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elegí un archivo" };
  }
  const caption = (formData.get("caption")?.toString() ?? "").trim();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffAttachment(bytes);
  if (!kind) {
    return { ok: false, error: "Formato no soportado (imágenes PNG/JPG/WEBP o PDF)" };
  }
  const meta = ATTACH_META[kind];
  const limit = kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      error: kind === "pdf" ? "El PDF supera 16MB" : "La imagen supera 5MB",
    };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Sin tenant" };

  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone, tenant_id, handoff_by, handoff_by_name")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

  // Ownership: solo el dueño del handoff (o un admin) puede responder.
  const agent = await currentAgent();
  const ownGuard = ownershipError(contact, agent);
  if (ownGuard) return { ok: false, error: ownGuard };

  // Nombre de archivo legible (para documentos y para el registro).
  const rawName = file.name && file.name.trim() ? file.name.trim() : `archivo.${meta.ext}`;
  const filename = rawName.slice(0, 120);
  const path = `${tenant.id}/${crypto.randomUUID()}.${meta.ext}`;

  // Subir con la sesión (RLS: solo bajo la carpeta del propio tenant).
  const { error: upErr } = await supabase.storage
    .from(ATTACH_BUCKET)
    .upload(path, bytes, { contentType: meta.mime, upsert: false });
  if (upErr) return { ok: false, error: `Storage: ${upErr.message}` };

  // URL firmada corta para que Meta la descargue (segundos).
  const { data: signed, error: signErr } = await supabase.storage
    .from(ATTACH_BUCKET)
    .createSignedUrl(path, 300);
  if (signErr || !signed?.signedUrl) {
    await supabase.storage.from(ATTACH_BUCKET).remove([path]);
    return { ok: false, error: "No se pudo generar la URL del adjunto" };
  }

  // Payload de Meta según el tipo.
  const mediaPayload =
    meta.waType === "image"
      ? { type: "image", image: { link: signed.signedUrl, ...(caption ? { caption } : {}) } }
      : {
          type: "document",
          document: { link: signed.signedUrl, filename, ...(caption ? { caption } : {}) },
        };

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
        ...mediaPayload,
      }),
    },
  );

  let payload: { error?: { message?: string }; messages?: { id?: string }[] } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* noop */
  }

  if (!res.ok) {
    // Limpiar el objeto subido si Meta rechazó (no quedó enviado).
    await supabase.storage.from(ATTACH_BUCKET).remove([path]);
    return {
      ok: false,
      error: `Meta: ${payload?.error?.message ?? `HTTP ${res.status}`}`,
    };
  }

  const wamid = payload?.messages?.[0]?.id ?? null;

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      tenant_id: tenant.id,
      contact_id: contactId,
      whatsapp_message_id: wamid,
      direction: "outbound",
      content: caption || null,
      message_type: meta.waType,
      media_url: path,
      media_mime: meta.mime,
      media_filename: meta.waType === "document" ? filename : null,
      sent_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  const preview = meta.waType === "image" ? "[imagen]" : `📎 ${filename}`;
  await supabase
    .from("contacts")
    .update({
      last_message_preview: caption ? `${preview} ${caption}`.slice(0, 200) : preview,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  revalidatePath("/contacts");
  // signedUrl para render inmediato en el cliente (evita re-firmar al toque).
  return { ok: true, message: inserted as Message, signedUrl: signed.signedUrl };
}

/**
 * Toma (on=true) o libera (on=false) el handoff, con ownership por agente.
 * - Tomar: claim ATÓMICO (solo si está sin asignar; el admin puede forzar y
 *   reasignar a sí mismo). Registra el dueño (handoff_by/handoff_by_name/at).
 * - Liberar: permitido al dueño, al admin, o si estaba sin asignar; resetea el
 *   estado de menú para que el próximo mensaje reinicie el bot.
 */
export async function setHandoff(
  contactId: string,
  on: boolean,
): Promise<AgentActionResult> {
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, flow_state, handoff_by, handoff_by_name")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

  const agent = await currentAgent();
  if (!agent) return { ok: false, error: "Sesión no válida" };

  if (on) {
    // TOMAR. Idempotente si ya es mía.
    if (!(contact.handoff_by && contact.handoff_by === agent.userId)) {
      const base = supabase
        .from("contacts")
        .update({
          handoff: true,
          handoff_by: agent.userId,
          handoff_by_name: agent.name,
          handoff_at: new Date().toISOString(),
        })
        .eq("id", contactId);
      // member: solo si está libre; admin/tenant_admin: puede forzar (reasignar a sí mismo).
      const q = agent.canOverride ? base : base.is("handoff_by", null);
      const { data: claimed, error } = await q.select("id");
      if (error) return { ok: false, error: error.message };
      if (!claimed || claimed.length === 0) {
        return {
          ok: false,
          error: `La está atendiendo ${contact.handoff_by_name ?? "otro agente"}.`,
        };
      }
    }
  } else {
    // LIBERAR. Bloqueado si la tiene otro y no tengo override.
    if (contact.handoff_by && contact.handoff_by !== agent.userId && !agent.canOverride) {
      return {
        ok: false,
        error: `La está atendiendo ${contact.handoff_by_name ?? "otro agente"}.`,
      };
    }
    const { error } = await supabase
      .from("contacts")
      .update({
        handoff: false,
        handoff_by: null,
        handoff_by_name: null,
        handoff_at: null,
        flow_state: {
          ...readFlowState(contact),
          current_menu: null,
          muted_date: null,
          urgent: false,
        },
      })
      .eq("id", contactId);
    if (error) return { ok: false, error: error.message };
  }

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

  revalidatePath("/contacts");
  return { ok: true };
}
