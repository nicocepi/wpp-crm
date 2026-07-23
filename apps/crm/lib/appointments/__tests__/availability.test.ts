import { describe, it, expect } from "vitest";
import {
  computeAvailability,
  type AvailabilityInput,
  type ProfessionalInput,
} from "../availability";
import { resolveDuration, resolveMaxPerSlot, resolveSlotMinutes } from "../config";

const AR = "America/Argentina/Buenos_Aires";
// 2024-01-15 es lunes (weekday 1). now muy anterior para no gatillar lead/advance.
const MONDAY = "2024-01-15";

function prof(overrides: Partial<ProfessionalInput> = {}): ProfessionalInput {
  return {
    id: "p1",
    slotMinutes: 30,
    maxPerSlot: 1,
    schedules: [{ weekday: 1, start: "09:00", end: "13:00" }],
    exceptions: [],
    busy: [],
    ...overrides,
  };
}

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: AR,
    now: new Date("2024-01-01T00:00:00Z"),
    rangeStart: MONDAY,
    rangeEnd: MONDAY,
    minLeadMinutes: 0,
    maxAdvanceDays: 3650,
    treatmentDuration: 30,
    bufferMinutes: 0,
    professionals: [prof()],
    ...overrides,
  };
}

describe("computeAvailability — generación de franjas", () => {
  it("genera franjas de 30 min en 09:00-13:00 (8 slots)", () => {
    const slots = computeAvailability(input());
    expect(slots.length).toBe(8);
    expect(slots[0].startLabel).toBe("09:00");
    expect(slots.at(-1)!.startLabel).toBe("12:30");
  });

  it("tratamiento de 60 min en franjas de 30 (7 slots, último 12:00)", () => {
    const slots = computeAvailability(input({ treatmentDuration: 60 }));
    expect(slots.length).toBe(7);
    expect(slots.at(-1)!.startLabel).toBe("12:00");
    // El fin visible del último es 13:00.
    expect(slots.at(-1)!.endAt).toContain("T16:00:00"); // 13:00 AR = 16:00 UTC
  });

  it("turno que cruza el cierre queda excluido (90 min en 09-13 => último 11:30)", () => {
    const slots = computeAvailability(input({ treatmentDuration: 90 }));
    expect(slots.length).toBe(6);
    expect(slots.at(-1)!.startLabel).toBe("11:30");
  });

  it("soporta horarios partidos (09-13 y 15-19)", () => {
    const p = prof({
      schedules: [
        { weekday: 1, start: "09:00", end: "13:00" },
        { weekday: 1, start: "15:00", end: "19:00" },
      ],
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.length).toBe(16); // 8 + 8
    expect(slots.some((s) => s.startLabel === "15:00")).toBe(true);
    expect(slots.some((s) => s.startLabel === "13:30")).toBe(false); // hueco
  });
});

describe("computeAvailability — cupos y ocupación", () => {
  it("cupo 1 con turno solapado => slot no disponible", () => {
    const p = prof({
      busy: [{ startAt: "2024-01-15T12:00:00Z", endAt: "2024-01-15T12:30:00Z" }],
      // 12:00 UTC = 09:00 AR
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.some((s) => s.startLabel === "09:00")).toBe(false);
    expect(slots.length).toBe(7);
  });

  it("cupo 2 con un turno solapado => slot disponible con remaining 1", () => {
    const p = prof({
      maxPerSlot: 2,
      busy: [{ startAt: "2024-01-15T12:00:00Z", endAt: "2024-01-15T12:30:00Z" }],
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    const nine = slots.find((s) => s.startLabel === "09:00")!;
    expect(nine.max).toBe(2);
    expect(nine.occupied).toBe(1);
    expect(nine.remaining).toBe(1);
  });

  it("turno no solapado no consume cupo del slot", () => {
    const p = prof({
      busy: [{ startAt: "2024-01-15T20:00:00Z", endAt: "2024-01-15T20:30:00Z" }],
      // 17:00 AR, fuera del rango 09-13
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.length).toBe(8);
  });
});

describe("computeAvailability — excepciones", () => {
  it("feriado / bloqueo de día completo => 0 slots", () => {
    const p = prof({
      exceptions: [
        { date: MONDAY, startTime: null, endTime: null, type: "holiday" },
      ],
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.length).toBe(0);
  });

  it("bloqueo parcial (10:00-11:00) elimina esas franjas", () => {
    const p = prof({
      exceptions: [
        { date: MONDAY, startTime: "10:00", endTime: "11:00", type: "block" },
      ],
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.some((s) => s.startLabel === "10:00")).toBe(false);
    expect(slots.some((s) => s.startLabel === "10:30")).toBe(false);
    expect(slots.some((s) => s.startLabel === "11:00")).toBe(true);
  });

  it("apertura excepcional (open) agrega disponibilidad en día sin horario", () => {
    const p = prof({
      schedules: [], // sin horario habitual el lunes
      exceptions: [
        { date: MONDAY, startTime: "10:00", endTime: "12:00", type: "open" },
      ],
    });
    const slots = computeAvailability(input({ professionals: [p] }));
    expect(slots.length).toBe(4); // 10:00,10:30,11:00,11:30
    expect(slots[0].startLabel).toBe("10:00");
  });
});

describe("computeAvailability — límites temporales", () => {
  it("anticipación mínima filtra franjas demasiado próximas", () => {
    // now = 12:00 AR (15:00Z). lead 60 => minStart 13:00 AR. Nada antes de 13:00.
    const slots = computeAvailability(
      input({
        now: new Date("2024-01-15T15:00:00Z"),
        minLeadMinutes: 60,
        professionals: [prof({ schedules: [{ weekday: 1, start: "09:00", end: "18:00" }] })],
      }),
    );
    expect(slots[0].startLabel).toBe("13:00");
  });

  it("límite futuro máximo filtra fechas lejanas", () => {
    // now Jan 1, maxAdvance 5 días => Jan 15 (14 días) fuera de rango.
    const slots = computeAvailability(
      input({ now: new Date("2024-01-01T00:00:00Z"), maxAdvanceDays: 5 }),
    );
    expect(slots.length).toBe(0);
  });
});

describe("computeAvailability — zona horaria / DST", () => {
  it("Buenos Aires (UTC-3): 09:00 local => 12:00Z", () => {
    const slots = computeAvailability(input());
    expect(slots[0].startAt).toBe("2024-01-15T12:00:00.000Z");
  });

  it("New York spring-forward (2024-03-10): 09:00 EDT => 13:00Z", () => {
    // 2024-03-10 es domingo (weekday 0).
    const p = prof({
      schedules: [{ weekday: 0, start: "09:00", end: "10:00" }],
    });
    const slots = computeAvailability(
      input({
        timezone: "America/New_York",
        rangeStart: "2024-03-10",
        rangeEnd: "2024-03-10",
        professionals: [p],
      }),
    );
    expect(slots[0].startAt).toBe("2024-03-10T13:00:00.000Z");
  });
});

describe("computeAvailability — múltiples profesionales", () => {
  it("agrega slots de todos los profesionales elegibles ordenados", () => {
    const slots = computeAvailability(
      input({
        professionals: [
          prof({ id: "p1" }),
          prof({ id: "p2", schedules: [{ weekday: 1, start: "09:00", end: "10:00" }] }),
        ],
      }),
    );
    expect(slots.filter((s) => s.professionalId === "p2").length).toBe(2);
    // Ordenado cronológicamente.
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i - 1].startAt <= slots[i].startAt).toBe(true);
    }
  });
});

describe("config — jerarquía de configuración", () => {
  const base = {
    settingsSlotMinutes: 30,
    settingsAppointmentMinutes: 30,
    treatmentDuration: 60,
    treatmentSlotMinutes: null,
    professionalSlotMinutes: 45,
    professionalMaxPerSlot: 2,
    overrideDuration: null,
    overrideSlotMinutes: null,
    overrideMaxPerSlot: null,
  };

  it("duración: prof+trat > tratamiento > empresa", () => {
    expect(resolveDuration(base)).toBe(60); // del tratamiento
    expect(resolveDuration({ ...base, overrideDuration: 90 })).toBe(90);
    expect(
      resolveDuration({ ...base, treatmentDuration: null, overrideDuration: null }),
    ).toBe(30); // cae a empresa
  });

  it("franja: prof+trat > profesional > empresa", () => {
    expect(resolveSlotMinutes(base)).toBe(45); // del profesional
    expect(resolveSlotMinutes({ ...base, overrideSlotMinutes: 20 })).toBe(20);
    expect(
      resolveSlotMinutes({ ...base, professionalSlotMinutes: null }),
    ).toBe(30); // cae a empresa
  });

  it("cupo: prof+trat > profesional > 1", () => {
    expect(resolveMaxPerSlot(base)).toBe(2);
    expect(resolveMaxPerSlot({ ...base, overrideMaxPerSlot: 5 })).toBe(5);
    expect(resolveMaxPerSlot({ ...base, professionalMaxPerSlot: 1 })).toBe(1);
  });
});
