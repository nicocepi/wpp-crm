import { NextResponse } from "next/server";
import { adminClient, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { confirmAppointment } from "@/lib/appointments/service";

export const dynamic = "force-dynamic";

/** Confirma un turno retenido (held/pending -> confirmed). Idempotente. */
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
  if (!tenantId || !appointmentId) return badRequest("Faltan tenant_id o appointment_id");

  const result = await confirmAppointment(adminClient(), tenantId, appointmentId, {
    source: "n8n",
    correlationId: b.correlation_id ? String(b.correlation_id) : null,
  });
  if (!result.ok) {
    const status = result.error === "hold_expired" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ appointment: result.data });
}
