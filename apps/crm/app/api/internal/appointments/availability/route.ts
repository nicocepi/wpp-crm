import { NextResponse } from "next/server";
import { adminClient, assertModuleEnabled, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { getAvailability } from "@/lib/appointments/repository";

export const dynamic = "force-dynamic";

/** Franjas disponibles calculadas en backend. n8n NUNCA inventa horarios. */
export async function POST(req: Request) {
  if (!checkSecret(req)) return unauthorized();
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return badRequest("Body inválido");
  }
  const tenantId = String(b.tenant_id ?? "");
  const treatmentId = String(b.treatment_id ?? "");
  const from = String(b.from ?? "");
  const to = String(b.to ?? "");
  if (!tenantId || !treatmentId || !from || !to) {
    return badRequest("Faltan tenant_id, treatment_id, from o to");
  }

  const supabase = adminClient();
  const enabled = await assertModuleEnabled(supabase, tenantId);
  if (!enabled.ok) return NextResponse.json({ error: enabled.error }, { status: 403 });

  const result = await getAvailability(supabase, {
    tenantId,
    treatmentId,
    specialtyId: b.specialty_id ? String(b.specialty_id) : null,
    professionalId: b.professional_id ? String(b.professional_id) : null,
    from,
    to,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Devolver una cantidad acotada al flujo de WhatsApp (n8n pagina con "más opciones").
  return NextResponse.json({ timezone: result.timezone, slots: result.slots });
}
