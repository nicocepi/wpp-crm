import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Appointment } from "@/lib/types";
import { resolveTreatmentDuration } from "./repository";
import { attemptGcalSync } from "./gcal-sync";

type DB = SupabaseClient<Database>;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Ctx = {
  /** Origen para event_logs / auditoría: 'crm' (panel) o 'n8n' (WhatsApp). */
  source?: "crm" | "n8n";
  /** Usuario que ejecuta (si es manual desde el panel). */
  userId?: string | null;
  correlationId?: string | null;
};

/** Log estructurado en event_logs (nunca tokens ni datos sensibles). */
async function logEvent(
  supabase: DB,
  tenantId: string,
  event: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown>,
  ctx: Ctx,
) {
  try {
    await supabase.from("event_logs").insert({
      tenant_id: tenantId,
      source: ctx.source ?? "crm",
      level,
      event,
      message,
      data: { ...data, correlation_id: ctx.correlationId ?? null } as never,
    });
  } catch {
    // el logging nunca debe romper la operación
  }
}

/** Traduce errores conocidos de las funciones SQL a mensajes estables. */
function mapDbError(msg: string | undefined): string {
  if (!msg) return "error";
  for (const code of [
    "slot_full",
    "tenant_mismatch",
    "invalid_professional",
    "invalid_status",
    "hold_expired",
    "appointment_not_found",
  ]) {
    if (msg.includes(code)) return code;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// hold: retención temporal de un horario (revalida disponibilidad en la tx).
// ---------------------------------------------------------------------------
export type HoldParams = {
  tenantId: string;
  professionalId: string;
  treatmentId: string;
  specialtyId?: string | null;
  startAt: string; // ISO UTC
  contactId?: string | null;
  phone?: string | null;
  idempotencyKey?: string | null;
  holdMinutes?: number | null;
};

export async function holdSlot(
  supabase: DB,
  p: HoldParams,
  ctx: Ctx = {},
): Promise<ServiceResult<Appointment>> {
  const duration = await resolveTreatmentDuration(
    supabase,
    p.tenantId,
    p.treatmentId,
    p.professionalId,
  );
  if (!duration) {
    return { ok: false, error: "invalid_treatment" };
  }

  let specialtyId = p.specialtyId ?? null;
  if (!specialtyId) {
    const { data: t } = await supabase
      .from("treatments")
      .select("specialty_id")
      .eq("tenant_id", p.tenantId)
      .eq("id", p.treatmentId)
      .maybeSingle();
    specialtyId = t?.specialty_id ?? null;
  }

  let holdMinutes = p.holdMinutes ?? null;
  if (holdMinutes == null) {
    const { data: s } = await supabase
      .from("appointment_settings")
      .select("hold_minutes")
      .eq("tenant_id", p.tenantId)
      .maybeSingle();
    holdMinutes = s?.hold_minutes ?? 10;
  }

  const { data, error } = await supabase.rpc("book_appointment", {
    p_tenant_id: p.tenantId,
    p_professional_id: p.professionalId,
    p_treatment_id: p.treatmentId,
    p_specialty_id: specialtyId as string,
    p_start_at: p.startAt,
    p_duration_minutes: duration,
    p_status: "held",
    p_contact_id: p.contactId ?? null,
    p_phone: p.phone ?? null,
    p_origin: ctx.source === "n8n" ? "whatsapp" : "admin",
    p_hold_minutes: holdMinutes,
    p_idempotency_key: p.idempotencyKey ?? null,
    p_correlation_id: ctx.correlationId ?? null,
    p_created_by: ctx.userId ?? null,
    p_notes: null,
  });

  if (error) {
    const mapped = mapDbError(error.message);
    await logEvent(
      supabase,
      p.tenantId,
      mapped === "slot_full" ? "appt_slot_full" : "appt_hold_error",
      "warn",
      `hold falló: ${mapped}`,
      { professional_id: p.professionalId, start_at: p.startAt, treatment_id: p.treatmentId },
      ctx,
    );
    return { ok: false, error: mapped };
  }
  const row = data as unknown as Appointment;
  await logEvent(
    supabase,
    p.tenantId,
    "appt_hold",
    "info",
    "retención creada",
    { appointment_id: row.id, professional_id: p.professionalId, start_at: p.startAt },
    ctx,
  );
  return { ok: true, data: row };
}

// ---------------------------------------------------------------------------
// confirm: held/pending -> confirmed (revalida vencimiento).
// ---------------------------------------------------------------------------
export async function confirmAppointment(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  ctx: Ctx = {},
): Promise<ServiceResult<Appointment>> {
  const { data, error } = await supabase.rpc("confirm_held_appointment", {
    p_appointment_id: appointmentId,
    p_tenant_id: tenantId,
    p_correlation_id: ctx.correlationId ?? null,
    p_created_by: ctx.userId ?? null,
  });
  if (error) {
    const mapped = mapDbError(error.message);
    await logEvent(supabase, tenantId, "appt_confirm_error", "warn", `confirm falló: ${mapped}`, { appointment_id: appointmentId }, ctx);
    return { ok: false, error: mapped };
  }
  const row = data as unknown as Appointment;
  await logEvent(supabase, tenantId, "appt_confirm", "info", "turno confirmado", { appointment_id: row.id }, ctx);

  await attemptGcalSync(supabase, tenantId, row.id, "create", ctx);
  return { ok: true, data: row };
}

// ---------------------------------------------------------------------------
// reopen: vuelve un turno a pending/confirmed RE-VALIDANDO cupo en la misma
// transacción (excluyéndose del conteo). Necesario para "Reabrir" desde el
// panel: mientras estuvo completed/no_show/cancelled no consumía cupo, así
// que otro turno pudo haber ocupado esa franja en el medio.
// ---------------------------------------------------------------------------
export async function reopenAppointment(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  status: "pending" | "confirmed",
  ctx: Ctx = {},
): Promise<ServiceResult<Appointment>> {
  const { data, error } = await supabase.rpc("reopen_appointment", {
    p_tenant_id: tenantId,
    p_appointment_id: appointmentId,
    p_status: status,
    p_correlation_id: ctx.correlationId ?? null,
    p_created_by: ctx.userId ?? null,
  });
  if (error) {
    const mapped = mapDbError(error.message);
    await logEvent(supabase, tenantId, "appt_reopen_error", "warn", `reopen falló: ${mapped}`, { appointment_id: appointmentId }, ctx);
    return { ok: false, error: mapped };
  }
  const row = data as unknown as Appointment;
  await logEvent(supabase, tenantId, "appt_reopen", "info", "turno reabierto", { appointment_id: row.id, status }, ctx);

  // El evento anterior (si lo había) pudo haber sido borrado en Google al
  // cancelar/marcar ausente; al reabrir se crea uno nuevo en vez de intentar
  // actualizar un evento que ya no existe.
  await supabase
    .from("appointments")
    .update({ gcal_event_id: null, sync_status: "disabled", sync_error: null, synced_at: null })
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId);
  await attemptGcalSync(supabase, tenantId, appointmentId, "create", ctx);
  return { ok: true, data: row };
}

// ---------------------------------------------------------------------------
// cancel: libera cupo (cancelled no consume). Escribe auditoría.
// ---------------------------------------------------------------------------
export async function cancelAppointment(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  ctx: Ctx = {},
): Promise<ServiceResult<Appointment>> {
  const { data: old } = await supabase
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (!old) return { ok: false, error: "appointment_not_found" };
  if (["cancelled", "rescheduled"].includes(old.status)) {
    return { ok: true, data: old as Appointment }; // idempotente
  }

  const { data: row, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", hold_expires_at: null })
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };

  await writeAudit(supabase, tenantId, appointmentId, "cancelled", old, row, ctx);
  await logEvent(supabase, tenantId, "appt_cancel", "info", "turno cancelado", { appointment_id: appointmentId }, ctx);
  await attemptGcalSync(supabase, tenantId, appointmentId, "delete", ctx);
  return { ok: true, data: row as Appointment };
}

// ---------------------------------------------------------------------------
// reschedule: crea turno nuevo (confirmado) y marca el anterior 'rescheduled'.
// Conserva trazabilidad via rescheduled_from.
// ---------------------------------------------------------------------------
export type RescheduleParams = {
  tenantId: string;
  appointmentId: string;
  newStartAt: string; // ISO UTC
  newProfessionalId?: string | null; // por defecto el mismo profesional
  idempotencyKey?: string | null;
};

export async function rescheduleAppointment(
  supabase: DB,
  p: RescheduleParams,
  ctx: Ctx = {},
): Promise<ServiceResult<{ old: Appointment; next: Appointment }>> {
  const { data: old } = await supabase
    .from("appointments")
    .select("*")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.appointmentId)
    .maybeSingle();
  if (!old) return { ok: false, error: "appointment_not_found" };
  if (!["held", "pending", "confirmed"].includes(old.status)) {
    return { ok: false, error: "invalid_status" };
  }
  const professionalId = p.newProfessionalId ?? old.professional_id;
  if (!professionalId || !old.treatment_id) {
    return { ok: false, error: "invalid_appointment" };
  }

  // Reprogramar al mismo horario y profesional es un no-op inválido.
  if (professionalId === old.professional_id && p.newStartAt === old.start_at) {
    return { ok: false, error: "same_slot" };
  }

  const duration = await resolveTreatmentDuration(
    supabase,
    p.tenantId,
    old.treatment_id,
    professionalId,
  );
  if (!duration) return { ok: false, error: "invalid_treatment" };

  const { data: created, error: bookErr } = await supabase.rpc("book_appointment", {
    p_tenant_id: p.tenantId,
    p_professional_id: professionalId,
    p_treatment_id: old.treatment_id,
    p_specialty_id: old.specialty_id as string,
    p_start_at: p.newStartAt,
    p_duration_minutes: duration,
    p_status: "confirmed",
    p_contact_id: old.contact_id,
    p_phone: old.phone,
    p_origin: ctx.source === "n8n" ? "whatsapp" : "admin",
    p_hold_minutes: 10,
    p_idempotency_key: p.idempotencyKey ?? null,
    p_correlation_id: ctx.correlationId ?? old.correlation_id ?? null,
    p_created_by: ctx.userId ?? null,
    p_notes: old.notes,
  });
  if (bookErr) {
    const mapped = mapDbError(bookErr.message);
    await logEvent(supabase, p.tenantId, "appt_reschedule_error", "warn", `reschedule falló: ${mapped}`, { appointment_id: p.appointmentId }, ctx);
    return { ok: false, error: mapped };
  }
  const next = created as unknown as Appointment;

  // Vincular trazabilidad y cerrar el anterior. Si el turno anterior ya tenía
  // evento en Google, el nuevo turno "hereda" ese mismo gcal_event_id para que
  // la sync lo actualice (mueva el evento) en vez de crear uno duplicado.
  await supabase
    .from("appointments")
    .update({
      rescheduled_from: p.appointmentId,
      gcal_event_id: old.gcal_event_id,
      gcal_calendar_id: old.gcal_calendar_id,
    })
    .eq("tenant_id", p.tenantId)
    .eq("id", next.id);
  next.gcal_event_id = old.gcal_event_id;

  const { data: oldUpdated } = await supabase
    .from("appointments")
    .update({ status: "rescheduled", hold_expires_at: null, gcal_event_id: null })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.appointmentId)
    .select()
    .single();

  await writeAudit(supabase, p.tenantId, p.appointmentId, "rescheduled", old, { ...old, status: "rescheduled", rescheduled_to: next.id }, ctx);
  await logEvent(supabase, p.tenantId, "appt_reschedule", "info", "turno reprogramado", { from: p.appointmentId, to: next.id }, ctx);
  await attemptGcalSync(supabase, p.tenantId, next.id, "update", ctx);

  return {
    ok: true,
    data: { old: (oldUpdated ?? old) as Appointment, next },
  };
}

// ---------------------------------------------------------------------------
// upcoming: turnos futuros de un contacto (para cancelar/reprogramar por WA).
// ---------------------------------------------------------------------------
export async function getUpcomingForContact(
  supabase: DB,
  tenantId: string,
  contactId: string,
): Promise<ServiceResult<Appointment[]>> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .in("status", ["held", "pending", "confirmed"])
    .gt("start_at", new Date().toISOString())
    .order("start_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Appointment[] };
}

// ---------------------------------------------------------------------------
// Auditoría y Google Calendar (scaffolding Fase 2)
// ---------------------------------------------------------------------------
async function writeAudit(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  action: string,
  oldVals: unknown,
  newVals: unknown,
  ctx: Ctx,
) {
  try {
    await supabase.from("appointment_audit").insert({
      tenant_id: tenantId,
      appointment_id: appointmentId,
      actor_user_id: ctx.userId ?? null,
      actor_source: ctx.source === "n8n" ? "whatsapp" : "admin",
      action,
      old_values: oldVals as never,
      new_values: newVals as never,
      correlation_id: ctx.correlationId ?? null,
    });
  } catch {
    /* la auditoría no debe romper la operación */
  }
}

