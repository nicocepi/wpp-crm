/**
 * Resolución de configuración por jerarquía. Documentada y compartida para que
 * el motor, los endpoints y el panel usen las mismas reglas.
 *
 * Jerarquía (de más específico a más general):
 *   1. Profesional + tratamiento  (professional_treatments)
 *   2. Profesional                (professionals)
 *   3. Tratamiento                (treatments)  — solo aplica a duración
 *   4. Empresa                    (appointment_settings)
 *
 * max_per_slot es un atributo del recurso profesional (no del tratamiento ni de
 * la empresa): coincide con appt_resolve_max_per_slot() en appointments.sql.
 */

export type ConfigInputs = {
  settingsSlotMinutes: number;
  settingsAppointmentMinutes: number;
  treatmentDuration: number | null;
  treatmentSlotMinutes?: null; // el tratamiento no define franja en este modelo
  professionalSlotMinutes: number | null;
  professionalMaxPerSlot: number;
  overrideDuration: number | null; // professional_treatments.duration_minutes
  overrideSlotMinutes: number | null; // professional_treatments.slot_minutes
  overrideMaxPerSlot: number | null; // professional_treatments.max_per_slot
};

/** Duración del turno resuelta (minutos): prof+trat > tratamiento > empresa. */
export function resolveDuration(c: ConfigInputs): number {
  return (
    c.overrideDuration ??
    c.treatmentDuration ??
    c.settingsAppointmentMinutes
  );
}

/** Tamaño de franja resuelto (minutos): prof+trat > profesional > empresa. */
export function resolveSlotMinutes(c: ConfigInputs): number {
  return (
    c.overrideSlotMinutes ??
    c.professionalSlotMinutes ??
    c.settingsSlotMinutes
  );
}

/** Cupo máximo por franja: prof+trat > profesional > 1. */
export function resolveMaxPerSlot(c: ConfigInputs): number {
  return c.overrideMaxPerSlot ?? c.professionalMaxPerSlot ?? 1;
}
