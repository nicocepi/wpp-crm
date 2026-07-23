import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Tests de integración de CONCURRENCIA contra una base real (Supabase local).
 * Verifican la prevención de doble reserva de book_appointment (advisory lock +
 * conteo de cupo en la transacción) y la idempotencia.
 *
 * Cómo correrlos:
 *   1) supabase start   (o una Postgres con appointments.sql aplicado)
 *   2) Exportar:
 *        SUPABASE_TEST_URL=http://127.0.0.1:54321
 *        SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role key local>
 *   3) pnpm --filter crm test
 *
 * Sin esas variables, la suite se saltea (no rompe el run por defecto).
 */

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = !!URL && !!KEY;

const D = describe as typeof describe & { skip: typeof describe };
const suite = enabled ? describe : D.skip;

suite("book_appointment — concurrencia e idempotencia", () => {
  let db: SupabaseClient<Database>;
  let tenantId = "";
  let professionalId = "";
  let treatmentId = "";
  const startAt = "2030-01-15T13:00:00.000Z"; // futuro lejano, fijo

  beforeAll(async () => {
    db = createClient<Database>(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tenant } = await db
      .from("tenants")
      .insert({ name: "TEST Turnos", whatsapp_phone_id: `test-${Date.now()}` })
      .select("id")
      .single();
    tenantId = tenant!.id;

    await db.from("appointment_settings").insert({ tenant_id: tenantId, enabled: true });

    const { data: spec } = await db
      .from("specialties")
      .insert({ tenant_id: tenantId, name: "Test" })
      .select("id")
      .single();

    const { data: treat } = await db
      .from("treatments")
      .insert({ tenant_id: tenantId, specialty_id: spec!.id, name: "Consulta", duration_minutes: 30 })
      .select("id")
      .single();
    treatmentId = treat!.id;

    const { data: prof } = await db
      .from("professionals")
      .insert({ tenant_id: tenantId, first_name: "Test", max_per_slot: 1 })
      .select("id")
      .single();
    professionalId = prof!.id;
  });

  afterAll(async () => {
    if (!tenantId) return;
    await db.from("appointments").delete().eq("tenant_id", tenantId);
    await db.from("professionals").delete().eq("tenant_id", tenantId);
    await db.from("treatments").delete().eq("tenant_id", tenantId);
    await db.from("specialties").delete().eq("tenant_id", tenantId);
    await db.from("appointment_settings").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  });

  function book(idempotencyKey?: string) {
    return db.rpc("book_appointment", {
      p_tenant_id: tenantId,
      p_professional_id: professionalId,
      p_treatment_id: treatmentId,
      p_specialty_id: null as never,
      p_start_at: startAt,
      p_duration_minutes: 30,
      p_status: "confirmed",
      p_hold_minutes: 10,
      p_idempotency_key: idempotencyKey ?? null,
    });
  }

  it("dos solicitudes simultáneas por el último cupo => exactamente 1 gana (cupo 1)", async () => {
    await db.from("appointments").delete().eq("tenant_id", tenantId);
    const results = await Promise.all([book(), book(), book(), book(), book()]);
    const ok = results.filter((r) => !r.error).length;
    const full = results.filter((r) => r.error && r.error.message.includes("slot_full")).length;
    expect(ok).toBe(1);
    expect(full).toBe(4);
  });

  it("cupo 2 => exactamente 2 ganan, el resto slot_full", async () => {
    await db.from("appointments").delete().eq("tenant_id", tenantId);
    await db.from("professionals").update({ max_per_slot: 2 }).eq("id", professionalId);
    const results = await Promise.all([book(), book(), book(), book()]);
    const ok = results.filter((r) => !r.error).length;
    expect(ok).toBe(2);
    await db.from("professionals").update({ max_per_slot: 1 }).eq("id", professionalId);
  });

  it("idempotencia: la misma key no duplica el turno", async () => {
    await db.from("appointments").delete().eq("tenant_id", tenantId);
    const k = `idem-${Date.now()}`;
    const r1 = await book(k);
    const r2 = await book(k);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect((r1.data as { id: string }).id).toBe((r2.data as { id: string }).id);
    const { count } = await db
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    expect(count).toBe(1);
  });

  it("un turno cancelado libera el cupo", async () => {
    await db.from("appointments").delete().eq("tenant_id", tenantId);
    const r1 = await book();
    expect(r1.error).toBeNull();
    // Con el cupo tomado, un segundo turno falla.
    const r2 = await book();
    expect(r2.error?.message).toContain("slot_full");
    // Cancelar libera el cupo.
    await db.from("appointments").update({ status: "cancelled" }).eq("id", (r1.data as { id: string }).id);
    const r3 = await book();
    expect(r3.error).toBeNull();
  });
});
