import { NextResponse } from "next/server";
import { adminClient, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { cancelAppointment } from "@/lib/appointments/service";

export const dynamic = "force-dynamic";

/** Cancela un turno (libera el cupo). Idempotente. */
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

  const result = await cancelAppointment(adminClient(), tenantId, appointmentId, {
    source: "n8n",
    correlationId: b.correlation_id ? String(b.correlation_id) : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ appointment: result.data });
}
