import { NextResponse } from "next/server";
import { adminClient, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { rescheduleAppointment } from "@/lib/appointments/service";

export const dynamic = "force-dynamic";

/** Reprograma un turno: crea uno nuevo confirmado y marca el anterior. */
export async function POST(req: Request) {
  if (!checkSecret(req)) return unauthorized();
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return badRequest("Body inválido");
  }
  const tenantId = String(b.tenant_id ?? "");
  const appointmentId = String(b.appointment_id ?? "");
  const newStartAt = String(b.new_start_at ?? "");
  if (!tenantId || !appointmentId || !newStartAt) {
    return badRequest("Faltan tenant_id, appointment_id o new_start_at");
  }

  const result = await rescheduleAppointment(
    adminClient(),
    {
      tenantId,
      appointmentId,
      newStartAt,
      newProfessionalId: b.new_professional_id ? String(b.new_professional_id) : null,
      idempotencyKey: b.idempotency_key ? String(b.idempotency_key) : null,
    },
    { source: "n8n", correlationId: b.correlation_id ? String(b.correlation_id) : null },
  );
  if (!result.ok) {
    const status = result.error === "slot_full" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ old: result.data.old, next: result.data.next });
}
