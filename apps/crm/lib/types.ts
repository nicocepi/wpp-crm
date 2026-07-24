import type { Tables } from "@/lib/database.types";

export type Label = Tables<"labels">;
export type Contact = Tables<"contacts">;
export type Message = Tables<"messages">;
export type BotConfig = Tables<"bot_configs">;
export type Tenant = Tables<"tenants">;

// --- Módulo de turnos ---
export type AppointmentSettings = Tables<"appointment_settings">;
export type Specialty = Tables<"specialties">;
export type Treatment = Tables<"treatments">;
export type Professional = Tables<"professionals">;
export type ProfessionalSchedule = Tables<"professional_schedules">;
export type AvailabilityException = Tables<"availability_exceptions">;
export type Appointment = Tables<"appointments">;
export type AppointmentAudit = Tables<"appointment_audit">;

/** Estados de un turno (usar estas constantes, no strings sueltos). */
export const APPOINTMENT_STATUSES = [
  "held",
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "rescheduled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Estados que consumen cupo (deben coincidir con book_appointment en SQL). */
export const CUPO_CONSUMING_STATUSES: AppointmentStatus[] = [
  "held",
  "pending",
  "confirmed",
];

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
  // --- Sub-flujo de agendamiento de turnos (reusa el mismo estado por-contacto) ---
  appt_step?: string | null;            // paso actual del flujo de turno
  appt_specialty_id?: string | null;
  appt_treatment_id?: string | null;
  appt_professional_id?: string | null; // null = asignación automática
  appt_date?: string | null;            // "YYYY-MM-DD" preferida
  appt_slot_options?: string[];         // ids de slot ofrecidos en el último mensaje
  appt_hold_id?: string | null;         // turno en estado held pendiente de confirmar
  appt_correlation_id?: string | null;  // trazabilidad punta a punta
  appt_flow_expires_at?: string | null; // vencimiento del sub-flujo
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
