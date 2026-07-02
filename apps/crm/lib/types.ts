import type { Tables } from "@/lib/database.types";

export type Label = Tables<"labels">;
export type Contact = Tables<"contacts">;
export type Message = Tables<"messages">;
export type BotConfig = Tables<"bot_configs">;
export type Tenant = Tables<"tenants">;

/** Contacto con sus labels resueltas (join contact_labels -> labels). */
export type ContactWithLabels = Contact & {
  labels: Label[];
};

/** Nombre de la label que marca "necesita atención humana". */
export const ATTENTION_LABEL = "Necesita agente";
/** Nombre de la label de urgencia (la clasifica la IA). */
export const URGENT_LABEL = "Urgente";

/** Estado de conversación de menú guardado en contacts.flow_state (jsonb).
 *  Nota: `handoff` NO vive acá — es la columna dedicada contacts.handoff. */
export type FlowState = {
  current_menu?: string | null;
  muted_date?: string | null;
  awaiting_query?: boolean;
  path?: string[];
  urgent?: boolean;
};

/** Lee flow_state de forma segura (el campo es jsonb / Json). */
export function readFlowState(contact: Pick<Contact, "flow_state">): FlowState {
  const fs = contact.flow_state;
  return fs && typeof fs === "object" && !Array.isArray(fs)
    ? (fs as FlowState)
    : {};
}

/** ¿El contacto está derivado a un humano (bot en pausa)? Columna dedicada. */
export function isHandoff(contact: Pick<Contact, "handoff">): boolean {
  return contact.handoff === true;
}

type HandoffOwn = Pick<Contact, "handoff" | "handoff_by">;

/** ¿La conversación la tomó un agente (tiene dueño)? */
export function isTaken(contact: HandoffOwn): boolean {
  return !!contact.handoff_by;
}

/** ¿La tengo tomada yo? */
export function isOwnedByMe(contact: HandoffOwn, userId: string | null): boolean {
  return !!contact.handoff_by && contact.handoff_by === userId;
}

/** ¿Está tomada por OTRO agente y yo no puedo actuar (no soy dueño ni admin)? */
export function isLockedFor(
  contact: HandoffOwn,
  userId: string | null,
  isAdmin: boolean,
): boolean {
  return !!contact.handoff_by && contact.handoff_by !== userId && !isAdmin;
}

/** ¿La consulta del contacto fue clasificada como urgente? */
export function isUrgent(contact: Pick<Contact, "flow_state">): boolean {
  return readFlowState(contact).urgent === true;
}
