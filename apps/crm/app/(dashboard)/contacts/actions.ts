"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { readFlowState, ATTENTION_LABEL, URGENT_LABEL } from "@/lib/types";
import type { Message } from "@/lib/types";

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
    .select("id, phone, tenant_id")
    .eq("id", contactId)
    .single();
  if (!contact) return { ok: false, error: "Contacto no encontrado" };

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

  // handoff es una columna dedicada (no flow_state) para evitar el race con n8n.
  // Tomar control: solo set handoff=true. Reactivar: handoff=false + reset de la
  // sesión de menú (sin menú activo, sin mute del día ni urgencia) -> bienvenida.
  const update = on
    ? { handoff: true }
    : {
        handoff: false,
        flow_state: {
          ...readFlowState(contact),
          current_menu: null,
          muted_date: null,
          urgent: false,
        },
      };

  const { error } = await supabase
    .from("contacts")
    .update(update)
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

  revalidatePath("/contacts");
  return { ok: true };
}
