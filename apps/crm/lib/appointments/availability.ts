import { TZDate } from "@date-fns/tz";

/**
 * Motor de disponibilidad — funciones PURAS (sin DB, sin red). Reciben toda la
 * data ya cargada y devuelven las franjas disponibles. Es la ÚNICA fuente de
 * verdad del cálculo: la consumen los endpoints internos (n8n) y el panel.
 *
 * Zona horaria: los horarios habituales y excepciones se expresan en hora local
 * del tenant (wall-clock). Cada franja se convierte a un instante UTC con TZDate
 * (maneja DST correctamente). Los turnos/holes ocupados llegan como ISO UTC.
 */

export type ScheduleRange = {
  weekday: number; // 0=domingo ... 6=sábado (hora local del tenant)
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type ExceptionInput = {
  date: string; // "YYYY-MM-DD" (local)
  startTime: string | null; // "HH:MM" o null (día completo)
  endTime: string | null;
  type: "block" | "open" | "holiday" | "vacation" | "leave";
};

export type BusyInterval = {
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
};

export type ProfessionalInput = {
  id: string;
  slotMinutes: number;
  maxPerSlot: number;
  schedules: ScheduleRange[];
  exceptions: ExceptionInput[]; // propias + tenant-wide (feriados) ya combinadas
  busy: BusyInterval[]; // turnos activos + holds no vencidos que consumen cupo
};

export type AvailabilityInput = {
  timezone: string;
  now: Date; // "ahora" de referencia (instante UTC)
  rangeStart: string; // "YYYY-MM-DD" local, inclusive
  rangeEnd: string; // "YYYY-MM-DD" local, inclusive
  minLeadMinutes: number;
  maxAdvanceDays: number;
  treatmentDuration: number; // minutos (ya resuelta la jerarquía)
  bufferMinutes: number; // tiempo extra de preparación/limpieza
  professionals: ProfessionalInput[];
};

export type Slot = {
  date: string; // "YYYY-MM-DD" local
  startLabel: string; // "HH:MM" local
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC (fin del turno visible = inicio + duración)
  professionalId: string;
  max: number;
  occupied: number;
  remaining: number;
};

// --- helpers de tiempo ---

export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Instante UTC (ISO) de una hora local (min desde medianoche) en una fecha/TZ. */
function localToUtcIso(
  dateStr: string,
  minutesFromMidnight: number,
  timezone: string,
): string {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const tz = new TZDate(y, m - 1, d, hour, minute, 0, timezone);
  return new Date(tz.getTime()).toISOString();
}

/** Convierte una fecha+hora local ("YYYY-MM-DD","HH:MM") de una TZ a ISO UTC.
 *  Útil para el alta/reprogramación manual desde el panel (server-side). */
export function localWallTimeToUtc(
  dateStr: string,
  hhmm: string,
  timezone: string,
): string {
  return localToUtcIso(dateStr, parseHHMM(hhmm), timezone);
}

/** Día de la semana local (0-6) de una fecha "YYYY-MM-DD" en una TZ. */
function localWeekday(dateStr: string, timezone: string): number {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  return new TZDate(y, m - 1, d, 12, 0, 0, timezone).getDay();
}

/** Itera fechas "YYYY-MM-DD" de rangeStart a rangeEnd inclusive. */
function eachDate(rangeStart: string, rangeEnd: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = rangeStart.split("-").map((x) => parseInt(x, 10));
  const [ye, me, de] = rangeEnd.split("-").map((x) => parseInt(x, 10));
  // Usar UTC a mediodía para evitar cruces de DST al incrementar días.
  let cur = Date.UTC(ys, ms - 1, ds, 12);
  const end = Date.UTC(ye, me - 1, de, 12);
  let guard = 0;
  while (cur <= end && guard < 1000) {
    const dt = new Date(cur);
    out.push(
      `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
    );
    cur += 24 * 60 * 60 * 1000;
    guard++;
  }
  return out;
}

type Interval = { start: number; end: number }; // minutos locales

/** Resta `blocks` de `base` (intervalos en minutos locales). */
function subtractIntervals(base: Interval[], blocks: Interval[]): Interval[] {
  let result = base.slice();
  for (const block of blocks) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (block.end <= iv.start || block.start >= iv.end) {
        next.push(iv); // sin solape
        continue;
      }
      if (block.start > iv.start) next.push({ start: iv.start, end: block.start });
      if (block.end < iv.end) next.push({ start: block.end, end: iv.end });
    }
    result = next;
  }
  return result.filter((iv) => iv.end > iv.start);
}

/**
 * Franjas disponibles del día para un profesional. Aplica horarios habituales,
 * excepciones (block/open/holiday/vacation/leave), duración+buffer, cupo,
 * anticipación mínima, límite futuro y ocupación.
 */
function slotsForDay(
  dateStr: string,
  prof: ProfessionalInput,
  input: AvailabilityInput,
): Slot[] {
  const weekday = localWeekday(dateStr, input.timezone);

  // 1) Rangos habituales del día.
  let working: Interval[] = prof.schedules
    .filter((s) => s.weekday === weekday)
    .map((s) => ({ start: parseHHMM(s.start), end: parseHHMM(s.end) }));

  // 2) Excepciones del día.
  const dayExc = prof.exceptions.filter((e) => e.date === dateStr);
  const fullDayBlock = dayExc.some(
    (e) =>
      (e.type === "block" ||
        e.type === "holiday" ||
        e.type === "vacation" ||
        e.type === "leave") &&
      !e.startTime,
  );
  if (fullDayBlock) return []; // día completo bloqueado

  // Bloqueos parciales (restan) y aperturas (suman).
  const partialBlocks: Interval[] = dayExc
    .filter(
      (e) =>
        (e.type === "block" ||
          e.type === "holiday" ||
          e.type === "vacation" ||
          e.type === "leave") &&
        e.startTime &&
        e.endTime,
    )
    .map((e) => ({ start: parseHHMM(e.startTime!), end: parseHHMM(e.endTime!) }));

  const opens: Interval[] = dayExc
    .filter((e) => e.type === "open" && e.startTime && e.endTime)
    .map((e) => ({ start: parseHHMM(e.startTime!), end: parseHHMM(e.endTime!) }));

  working = working.concat(opens);
  working = subtractIntervals(working, partialBlocks);
  if (working.length === 0) return [];

  // 3) Generar franjas dentro de cada rango.
  const step = Math.max(prof.slotMinutes, 5);
  const duration = input.treatmentDuration;
  const occupyEnd = duration + input.bufferMinutes; // intervalo que ocupa cupo
  const leadMs = input.minLeadMinutes * 60 * 1000;
  const maxFutureMs = input.maxAdvanceDays * 24 * 60 * 60 * 1000;
  const minStart = input.now.getTime() + leadMs;
  const maxStart = input.now.getTime() + maxFutureMs;

  const seen = new Set<number>();
  const slots: Slot[] = [];

  for (const iv of working) {
    for (let m = iv.start; m + duration <= iv.end; m += step) {
      if (seen.has(m)) continue;
      seen.add(m);

      const startIso = localToUtcIso(dateStr, m, input.timezone);
      const startMs = new Date(startIso).getTime();
      if (startMs < minStart || startMs > maxStart) continue;

      const endIso = localToUtcIso(dateStr, m + duration, input.timezone);
      const occupyEndIso = localToUtcIso(
        dateStr,
        m + occupyEnd,
        input.timezone,
      );
      const occupyEndMs = new Date(occupyEndIso).getTime();

      // Ocupación: turnos activos que se solapan con [start, start+dur+buffer).
      let occupied = 0;
      for (const b of prof.busy) {
        const bs = new Date(b.startAt).getTime();
        const be = new Date(b.endAt).getTime();
        if (bs < occupyEndMs && be > startMs) occupied++;
      }
      const remaining = prof.maxPerSlot - occupied;
      if (remaining <= 0) continue;

      slots.push({
        date: dateStr,
        startLabel: minutesToHHMM(m),
        startAt: startIso,
        endAt: endIso,
        professionalId: prof.id,
        max: prof.maxPerSlot,
        occupied,
        remaining,
      });
    }
  }
  return slots;
}

/** Calcula todas las franjas disponibles del rango para todos los profesionales. */
export function computeAvailability(input: AvailabilityInput): Slot[] {
  const dates = eachDate(input.rangeStart, input.rangeEnd);
  const out: Slot[] = [];
  for (const prof of input.professionals) {
    for (const dateStr of dates) {
      out.push(...slotsForDay(dateStr, prof, input));
    }
  }
  // Orden cronológico y luego por profesional.
  out.sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) ||
      a.professionalId.localeCompare(b.professionalId),
  );
  return out;
}
