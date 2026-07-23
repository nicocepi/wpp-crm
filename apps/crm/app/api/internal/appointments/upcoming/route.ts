import { NextResponse } from "next/server";
import { adminClient, assertModuleEnabled, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { getUpcomingForContact } from "@/lib/appointments/service";

export const dynamic = "force-dynamic";

/** Turnos futuros de un contacto (para cancelar/reprogramar por WhatsApp).
 *  Acepta contact_id o, en su defecto, phone (se resuelve dentro del tenant). */
export async function POST(req: Request) {
  if (!checkSecret(req)) return unauthorized();
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return badRequest("Body inválido");
  }
  const tenantId = String(b.tenant_id ?? "");
  if (!tenantId) return badRequest("Falta tenant_id");

  const supabase = adminClient();
  const enabled = await assertModuleEnabled(supabase, tenantId);
  if (!enabled.ok) return NextResponse.json({ error: enabled.error }, { status: 403 });
  let contactId = b.contact_id ? String(b.contact_id) : "";
  if (!contactId && b.phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone", String(b.phone))
      .maybeSingle();
    contactId = data?.id ?? "";
  }
  if (!contactId) return NextResponse.json({ appointments: [] });

  const result = await getUpcomingForContact(supabase, tenantId, contactId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ appointments: result.data });
}
