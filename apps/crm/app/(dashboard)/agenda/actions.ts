"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";
import { localWallTimeToUtc } from "@/lib/appointments/availability";
import {
  cancelAppointment,
  confirmAppointment,
  holdSlot,
  rescheduleAppointment,
} from "@/lib/appointments/service";
import type { AppointmentStatus } from "@/lib/types";

export type ActionState = { ok?: boolean; error?: string; id?: string };

/** Resuelve tenant + userId del usuario logueado (o error). */
async function ctx(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sin sesión" };
  if (!profile.tenant) return { ok: false, error: "Sin tenant" };
  return { ok: true, tenantId: profile.tenant.id, userId: profile.userId };
}

function revalidate() {
  revalidatePath("/agenda");
  revalidatePath("/agenda/config");
}

// ===========================================================================
// Configuración del módulo
// ===========================================================================
export async function saveAppointmentSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();

  const num = (k: string, def: number, min: number, max: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def;
  };

  const { error } = await supabase.from("appointment_settings").upsert(
    {
      tenant_id: c.tenantId,
      enabled: formData.get("enabled") === "on",
      timezone: String(formData.get("timezone") ?? "America/Argentina/Buenos_Aires").trim(),
      slot_minutes: num("slot_minutes", 30, 5, 240),
      appointment_minutes: num("appointment_minutes", 30, 5, 480),
      min_lead_minutes: num("min_lead_minutes", 120, 0, 100000),
      max_advance_days: num("max_advance_days", 60, 1, 730),
      hold_minutes: num("hold_minutes", 10, 1, 120),
      allow_choose_professional: formData.get("allow_choose_professional") === "on",
      auto_assign_professional: formData.get("auto_assign_professional") === "on",
      allow_multiple_per_conversation: formData.get("allow_multiple_per_conversation") === "on",
      gcal_sync_enabled: formData.get("gcal_sync_enabled") === "on",
      cancellation_policy: String(formData.get("cancellation_policy") ?? "").trim() || null,
      reschedule_policy: String(formData.get("reschedule_policy") ?? "").trim() || null,
      msg_confirm_template: String(formData.get("msg_confirm_template") ?? "").trim() || null,
      msg_cancel_template: String(formData.get("msg_cancel_template") ?? "").trim() || null,
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Especialidades
// ===========================================================================
export async function upsertSpecialty(
  input: { id?: string; name: string; description?: string; active?: boolean },
): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };
  const supabase = await createClient();
  const row = {
    tenant_id: c.tenantId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    active: input.active ?? true,
  };
  const { data, error } = input.id
    ? await supabase.from("specialties").update(row).eq("tenant_id", c.tenantId).eq("id", input.id).select("id").single()
    : await supabase.from("specialties").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, id: data?.id };
}

export async function deleteSpecialty(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("specialties").delete().eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Tratamientos
// ===========================================================================
export async function upsertTreatment(input: {
  id?: string;
  name: string;
  specialty_id?: string | null;
  description?: string;
  duration_minutes: number;
  buffer_minutes?: number;
  price?: number | null;
  requirements?: string;
  active?: boolean;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (!input.name.trim()) return { error: "El nombre es obligatorio" };
  const supabase = await createClient();
  const row = {
    tenant_id: c.tenantId,
    name: input.name.trim(),
    specialty_id: input.specialty_id || null,
    description: input.description?.trim() || null,
    duration_minutes: Math.max(5, Math.min(480, Math.round(input.duration_minutes || 30))),
    buffer_minutes: Math.max(0, Math.min(240, Math.round(input.buffer_minutes ?? 0))),
    price: input.price ?? null,
    requirements: input.requirements?.trim() || null,
    active: input.active ?? true,
  };
  const { data, error } = input.id
    ? await supabase.from("treatments").update(row).eq("tenant_id", c.tenantId).eq("id", input.id).select("id").single()
    : await supabase.from("treatments").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, id: data?.id };
}

export async function deleteTreatment(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("treatments").delete().eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Profesionales
// ===========================================================================
export async function upsertProfessional(input: {
  id?: string;
  first_name: string;
  last_name?: string;
  external_ref?: string;
  slot_minutes?: number | null;
  max_per_slot?: number;
  color?: string;
  active?: boolean;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (!input.first_name.trim()) return { error: "El nombre es obligatorio" };
  const supabase = await createClient();
  const row = {
    tenant_id: c.tenantId,
    first_name: input.first_name.trim(),
    last_name: input.last_name?.trim() || null,
    external_ref: input.external_ref?.trim() || null,
    slot_minutes: input.slot_minutes ?? null,
    max_per_slot: Math.max(1, Math.min(50, Math.round(input.max_per_slot ?? 1))),
    color: input.color?.trim() || null,
    active: input.active ?? true,
  };
  const { data, error } = input.id
    ? await supabase.from("professionals").update(row).eq("tenant_id", c.tenantId).eq("id", input.id).select("id").single()
    : await supabase.from("professionals").insert(row).select("id").single();
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, id: data?.id };
}

export async function deleteProfessional(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("professionals").delete().eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Reemplaza los tratamientos habilitados de un profesional. */
export async function setProfessionalTreatments(
  professionalId: string,
  treatmentIds: string[],
): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  // Verificar pertenencia del profesional (RLS igual protege).
  const { data: prof } = await supabase.from("professionals").select("id").eq("tenant_id", c.tenantId).eq("id", professionalId).maybeSingle();
  if (!prof) return { error: "Profesional inválido" };
  await supabase.from("professional_treatments").delete().eq("professional_id", professionalId);
  if (treatmentIds.length > 0) {
    const { error } = await supabase
      .from("professional_treatments")
      .insert(treatmentIds.map((tid) => ({ professional_id: professionalId, treatment_id: tid })));
    if (error) return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

/** Reemplaza las especialidades de un profesional. */
export async function setProfessionalSpecialties(
  professionalId: string,
  specialtyIds: string[],
): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { data: prof } = await supabase.from("professionals").select("id").eq("tenant_id", c.tenantId).eq("id", professionalId).maybeSingle();
  if (!prof) return { error: "Profesional inválido" };
  await supabase.from("professional_specialties").delete().eq("professional_id", professionalId);
  if (specialtyIds.length > 0) {
    const { error } = await supabase
      .from("professional_specialties")
      .insert(specialtyIds.map((sid) => ({ professional_id: professionalId, specialty_id: sid })));
    if (error) return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Horarios habituales y excepciones
// ===========================================================================
export async function addSchedule(input: {
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (input.end_time <= input.start_time) return { error: "El fin debe ser mayor al inicio" };
  const supabase = await createClient();
  const { error } = await supabase.from("professional_schedules").insert({
    tenant_id: c.tenantId,
    professional_id: input.professional_id,
    weekday: input.weekday,
    start_time: input.start_time,
    end_time: input.end_time,
    active: true,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("professional_schedules").delete().eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function addException(input: {
  professional_id: string | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  type: string;
  reason?: string;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").insert({
    tenant_id: c.tenantId,
    professional_id: input.professional_id,
    date: input.date,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    type: input.type,
    reason: input.reason?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteException(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").delete().eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ===========================================================================
// Gestión de turnos
// ===========================================================================
/** Alta manual desde el panel: reserva (con chequeo de cupo) y confirma. */
export async function createManualAppointment(input: {
  professional_id: string;
  treatment_id: string;
  specialty_id?: string | null;
  date: string; // YYYY-MM-DD local
  time: string; // HH:MM local
  phone?: string;
  contact_id?: string | null;
  notes?: string;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("timezone")
    .eq("tenant_id", c.tenantId)
    .maybeSingle();
  const tz = settings?.timezone ?? "America/Argentina/Buenos_Aires";
  const startAt = localWallTimeToUtc(input.date, input.time, tz);

  const held = await holdSlot(
    supabase,
    {
      tenantId: c.tenantId,
      professionalId: input.professional_id,
      treatmentId: input.treatment_id,
      specialtyId: input.specialty_id ?? null,
      startAt,
      contactId: input.contact_id ?? null,
      phone: input.phone ?? null,
    },
    { source: "crm", userId: c.userId },
  );
  if (!held.ok) return { error: held.error };

  const confirmed = await confirmAppointment(supabase, c.tenantId, held.data.id, {
    source: "crm",
    userId: c.userId,
  });
  if (!confirmed.ok) return { error: confirmed.error };

  if (input.notes?.trim()) {
    await supabase.from("appointments").update({ notes: input.notes.trim() }).eq("tenant_id", c.tenantId).eq("id", held.data.id);
  }
  revalidate();
  return { ok: true, id: held.data.id };
}

/** Cambia estado a completed / no_show / pending / confirmed (no cancelar acá). */
export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  if (!["completed", "no_show", "pending", "confirmed"].includes(status)) {
    return { error: "Estado inválido para esta acción" };
  }
  const supabase = await createClient();
  const { data: old } = await supabase.from("appointments").select("*").eq("tenant_id", c.tenantId).eq("id", id).maybeSingle();
  if (!old) return { error: "Turno no encontrado" };
  const { data: row, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("tenant_id", c.tenantId)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  await supabase.from("appointment_audit").insert({
    tenant_id: c.tenantId,
    appointment_id: id,
    actor_user_id: c.userId,
    actor_source: "admin",
    action: "status_changed",
    old_values: old as never,
    new_values: row as never,
  });
  revalidate();
  return { ok: true };
}

export async function cancelAppointmentAction(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const res = await cancelAppointment(supabase, c.tenantId, id, { source: "crm", userId: c.userId });
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function rescheduleAppointmentAction(input: {
  id: string;
  date: string;
  time: string;
  professional_id?: string | null;
}): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("timezone")
    .eq("tenant_id", c.tenantId)
    .maybeSingle();
  const tz = settings?.timezone ?? "America/Argentina/Buenos_Aires";
  const newStartAt = localWallTimeToUtc(input.date, input.time, tz);
  const res = await rescheduleAppointment(
    supabase,
    { tenantId: c.tenantId, appointmentId: input.id, newStartAt, newProfessionalId: input.professional_id ?? null },
    { source: "crm", userId: c.userId },
  );
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true, id: res.data.next.id };
}

export async function updateAppointmentNotes(id: string, notes: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ notes: notes.trim() || null }).eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Reintento de sincronización con Google Calendar (stub en Fase 1). */
export async function retrySync(id: string): Promise<ActionState> {
  const c = await ctx();
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { data: s } = await supabase.from("appointment_settings").select("gcal_sync_enabled").eq("tenant_id", c.tenantId).maybeSingle();
  if (!s?.gcal_sync_enabled) return { error: "Google Calendar no está habilitado (Fase 2)" };
  const { error } = await supabase.from("appointments").update({ sync_status: "pending", sync_error: null }).eq("tenant_id", c.tenantId).eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("gcal_sync_outbox").insert({ tenant_id: c.tenantId, appointment_id: id, operation: "update", status: "pending" });
  revalidate();
  return { ok: true };
}
