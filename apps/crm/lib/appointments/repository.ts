import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  computeAvailability,
  type AvailabilityInput,
  type ProfessionalInput,
  type Slot,
} from "./availability";
import { resolveDuration, resolveMaxPerSlot, resolveSlotMinutes } from "./config";

type DB = SupabaseClient<Database>;

export type AvailabilityParams = {
  tenantId: string;
  treatmentId: string;
  specialtyId?: string | null;
  professionalId?: string | null; // null = todos los elegibles (auto-asignación)
  from: string; // "YYYY-MM-DD" local
  to: string; // "YYYY-MM-DD" local
  now?: Date;
};

export type AvailabilityResult =
  | { ok: true; slots: Slot[]; timezone: string }
  | { ok: false; error: string };

/**
 * Carga toda la data tenant-scoped y calcula la disponibilidad con el motor
 * puro. Sirve tanto para el panel (server client / RLS) como para los endpoints
 * internos de n8n (service-role). No duplica reglas: solo orquesta.
 */
export async function getAvailability(
  supabase: DB,
  params: AvailabilityParams,
): Promise<AvailabilityResult> {
  const { tenantId, treatmentId } = params;

  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!settings || !settings.enabled) {
    return { ok: false, error: "module_disabled" };
  }

  const { data: treatment } = await supabase
    .from("treatments")
    .select("id, tenant_id, duration_minutes, buffer_minutes, active, specialty_id")
    .eq("tenant_id", tenantId)
    .eq("id", treatmentId)
    .maybeSingle();
  if (!treatment || !treatment.active) {
    return { ok: false, error: "invalid_treatment" };
  }

  // Profesionales habilitados para el tratamiento (y activos).
  const { data: profLinks } = await supabase
    .from("professional_treatments")
    .select("professional_id, duration_minutes, slot_minutes, max_per_slot")
    .eq("treatment_id", treatmentId);
  let eligibleIds = (profLinks ?? []).map((l) => l.professional_id);
  if (params.professionalId) {
    eligibleIds = eligibleIds.filter((id) => id === params.professionalId);
  }
  if (eligibleIds.length === 0) {
    return { ok: true, slots: [], timezone: settings.timezone };
  }

  const { data: profs } = await supabase
    .from("professionals")
    .select("id, slot_minutes, max_per_slot, active")
    .eq("tenant_id", tenantId)
    .in("id", eligibleIds);
  const activeProfs = (profs ?? []).filter((p) => p.active);
  if (activeProfs.length === 0) {
    return { ok: true, slots: [], timezone: settings.timezone };
  }
  const activeIds = activeProfs.map((p) => p.id);

  const [{ data: schedules }, { data: exceptions }] = await Promise.all([
    supabase
      .from("professional_schedules")
      .select("professional_id, weekday, start_time, end_time, active")
      .eq("tenant_id", tenantId)
      .in("professional_id", activeIds),
    // Excepciones del profesional + feriados tenant-wide (professional_id null).
    supabase
      .from("availability_exceptions")
      .select("professional_id, date, start_time, end_time, type")
      .eq("tenant_id", tenantId)
      .gte("date", params.from)
      .lte("date", params.to),
  ]);

  // Turnos que consumen cupo dentro (con margen) del rango consultado.
  const fromUtc = new Date(`${params.from}T00:00:00Z`);
  fromUtc.setUTCDate(fromUtc.getUTCDate() - 1);
  const toUtc = new Date(`${params.to}T00:00:00Z`);
  toUtc.setUTCDate(toUtc.getUTCDate() + 2);
  const nowIso = (params.now ?? new Date()).toISOString();

  const { data: busyRows } = await supabase
    .from("appointments")
    .select("professional_id, start_at, end_at, status, hold_expires_at")
    .eq("tenant_id", tenantId)
    .in("professional_id", activeIds)
    .in("status", ["held", "pending", "confirmed"])
    .gte("start_at", fromUtc.toISOString())
    .lte("start_at", toUtc.toISOString());

  const now = params.now ?? new Date();

  const professionals: ProfessionalInput[] = activeProfs.map((p) => {
    const link = (profLinks ?? []).find((l) => l.professional_id === p.id);
    const cfg = {
      settingsSlotMinutes: settings.slot_minutes,
      settingsAppointmentMinutes: settings.appointment_minutes,
      treatmentDuration: treatment.duration_minutes,
      treatmentSlotMinutes: null as null,
      professionalSlotMinutes: p.slot_minutes,
      professionalMaxPerSlot: p.max_per_slot,
      overrideDuration: link?.duration_minutes ?? null,
      overrideSlotMinutes: link?.slot_minutes ?? null,
      overrideMaxPerSlot: link?.max_per_slot ?? null,
    };
    return {
      id: p.id,
      slotMinutes: resolveSlotMinutes(cfg),
      maxPerSlot: resolveMaxPerSlot(cfg),
      schedules: (schedules ?? [])
        .filter((s) => s.professional_id === p.id && s.active)
        .map((s) => ({
          weekday: s.weekday,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
        })),
      exceptions: (exceptions ?? [])
        .filter(
          (e) => e.professional_id === p.id || e.professional_id === null,
        )
        .map((e) => ({
          date: e.date,
          startTime: e.start_time ? e.start_time.slice(0, 5) : null,
          endTime: e.end_time ? e.end_time.slice(0, 5) : null,
          type: e.type as "block" | "open" | "holiday" | "vacation" | "leave",
        })),
      busy: (busyRows ?? [])
        .filter(
          (b) =>
            b.professional_id === p.id &&
            (b.status !== "held" ||
              (b.hold_expires_at != null &&
                new Date(b.hold_expires_at).getTime() > now.getTime())),
        )
        .map((b) => ({ startAt: b.start_at, endAt: b.end_at })),
    };
  });

  // La duración/buffer del turno es la del tratamiento (con override si aplica).
  // Puede variar por profesional vía override; si difiere, usamos la del
  // tratamiento base para el rango y dejamos que book_appointment recalcule.
  const baseCfg = {
    settingsSlotMinutes: settings.slot_minutes,
    settingsAppointmentMinutes: settings.appointment_minutes,
    treatmentDuration: treatment.duration_minutes,
    treatmentSlotMinutes: null as null,
    professionalSlotMinutes: null,
    professionalMaxPerSlot: 1,
    overrideDuration: null,
    overrideSlotMinutes: null,
    overrideMaxPerSlot: null,
  };

  const input: AvailabilityInput = {
    timezone: settings.timezone,
    now,
    rangeStart: params.from,
    rangeEnd: params.to,
    minLeadMinutes: settings.min_lead_minutes,
    maxAdvanceDays: settings.max_advance_days,
    treatmentDuration: resolveDuration(baseCfg),
    bufferMinutes: treatment.buffer_minutes,
    professionals,
  };

  return { ok: true, slots: computeAvailability(input), timezone: settings.timezone };
}

/** Duración resuelta de un tratamiento para un profesional (para book/hold). */
export async function resolveTreatmentDuration(
  supabase: DB,
  tenantId: string,
  treatmentId: string,
  professionalId: string,
): Promise<number | null> {
  const [{ data: t }, { data: link }, { data: s }] = await Promise.all([
    supabase
      .from("treatments")
      .select("duration_minutes")
      .eq("tenant_id", tenantId)
      .eq("id", treatmentId)
      .maybeSingle(),
    supabase
      .from("professional_treatments")
      .select("duration_minutes")
      .eq("treatment_id", treatmentId)
      .eq("professional_id", professionalId)
      .maybeSingle(),
    supabase
      .from("appointment_settings")
      .select("appointment_minutes")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  return (
    link?.duration_minutes ??
    t?.duration_minutes ??
    s?.appointment_minutes ??
    null
  );
}
