import { NextResponse } from "next/server";
import { adminClient, assertModuleEnabled, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { holdSlot } from "@/lib/appointments/service";

export const dynamic = "force-dynamic";

/** Crea una retención temporal (revalida disponibilidad dentro de la tx). */
export async function POST(req: Request) {
  if (!checkSecret(req)) return unauthorized();
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return badRequest("Body inválido");
  }
  const tenantId = String(b.tenant_id ?? "");
  const professionalId = String(b.professional_id ?? "");
  const treatmentId = String(b.treatment_id ?? "");
  const startAt = String(b.start_at ?? "");
  if (!tenantId || !professionalId || !treatmentId || !startAt) {
    return badRequest("Faltan tenant_id, professional_id, treatment_id o start_at");
  }

  const supabase = adminClient();
  const enabled = await assertModuleEnabled(supabase, tenantId);
  if (!enabled.ok) return NextResponse.json({ error: enabled.error }, { status: 403 });

  const result = await holdSlot(
    supabase,
    {
      tenantId,
      professionalId,
      treatmentId,
      specialtyId: b.specialty_id ? String(b.specialty_id) : null,
      startAt,
      contactId: b.contact_id ? String(b.contact_id) : null,
      phone: b.phone ? String(b.phone) : null,
      idempotencyKey: b.idempotency_key ? String(b.idempotency_key) : null,
    },
    { source: "n8n", correlationId: b.correlation_id ? String(b.correlation_id) : null },
  );
  if (!result.ok) {
    const status = result.error === "slot_full" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ appointment: result.data });
}
