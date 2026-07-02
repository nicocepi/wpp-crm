/**
 * Tipos minimos del payload del webhook de Meta WhatsApp Cloud API y la
 * normalizacion que reenviamos a n8n.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export interface MetaWebhookBody {
  object?: string;
  entry?: MetaEntry[];
}

interface MetaEntry {
  id?: string;
  changes?: MetaChange[];
}

interface MetaChange {
  field?: string;
  value?: MetaValue;
}

interface MetaValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: MetaMessage[];
  statuses?: unknown[]; // delivered/read/sent -> se ignoran
}

interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string; // unix seconds (string)
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
}

/** Evento normalizado que se reenvia a n8n. */
export interface NormalizedEvent {
  phone_number_id: string; // para resolver el tenant en n8n
  from: string; // numero del cliente
  contact_name: string | null;
  message_id: string;
  type: string; // text | image | document | audio | interactive | unsupported
  text: string; // contenido textual o placeholder para media
  timestamp: string; // ISO 8601
  // Metadatos de media entrante (image/document/audio). n8n baja el binario de
  // Meta con estos datos y lo sube a Storage. null cuando no aplica.
  media_id: string | null;
  media_mime: string | null;
  media_filename: string | null;
}

/** Extrae los metadatos de media segun el tipo (image/document/audio). */
function extractMedia(msg: MetaMessage): {
  media_id: string | null;
  media_mime: string | null;
  media_filename: string | null;
} {
  const media =
    msg.type === "image"
      ? msg.image
      : msg.type === "document"
        ? msg.document
        : msg.type === "audio"
          ? msg.audio
          : null;
  if (!media?.id) return { media_id: null, media_mime: null, media_filename: null };
  return {
    media_id: media.id,
    media_mime: media.mime_type ?? null,
    media_filename:
      (msg.type === "document" && msg.document?.filename) || null,
  };
}

/**
 * Convierte un message de Meta en texto plano segun su tipo.
 * - text: el body.
 * - image/audio: solo log (no descargamos media), guardamos un placeholder.
 * - interactive: titulo del boton/lista elegido.
 */
function extractText(msg: MetaMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "image":
      return msg.image?.caption ? `[imagen] ${msg.image.caption}` : "[imagen]";
    case "document":
      return msg.document?.filename
        ? `[documento] ${msg.document.filename}`
        : "[documento]";
    case "audio":
      return "[audio]";
    case "interactive": {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return reply?.title ?? "[respuesta interactiva]";
    }
    default:
      return `[mensaje no soportado: ${msg.type ?? "desconocido"}]`;
  }
}

/**
 * Recorre el payload de Meta y devuelve los eventos de mensajes entrantes
 * normalizados. Ignora entries de status (no traen `messages`).
 */
export function normalizeIncoming(body: MetaWebhookBody): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages || value.messages.length === 0) {
        continue; // status updates u otros -> ignorar
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        continue;
      }

      const contactName = value.contacts?.[0]?.profile?.name ?? null;

      for (const msg of value.messages) {
        if (!msg.id || !msg.from) {
          continue;
        }
        const tsSeconds = Number(msg.timestamp);
        const iso = Number.isFinite(tsSeconds)
          ? new Date(tsSeconds * 1000).toISOString()
          : new Date().toISOString();

        events.push({
          phone_number_id: phoneNumberId,
          from: msg.from,
          contact_name: contactName,
          message_id: msg.id,
          type: msg.type ?? "unsupported",
          text: extractText(msg),
          timestamp: iso,
          ...extractMedia(msg),
        });
      }
    }
  }

  return events;
}
