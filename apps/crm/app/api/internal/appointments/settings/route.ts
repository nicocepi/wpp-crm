import { NextResponse } from "next/server";
import { adminClient, assertModuleEnabled, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";
import { DEFAULT_WELCOME_MENU } from "@/lib/appointments/messages";

export const dynamic = "force-dynamic";

/** Settings de exhibición para el flujo de WhatsApp (menú inicial, etc.).
 *  También sirve como probe de "¿el módulo está habilitado?" para el primer
 *  contacto (Appt engine no debe mostrar el menú si el tenant no usa turnos). */
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

  const { data } = await supabase
    .from("appointment_settings")
    .select("msg_welcome_menu")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return NextResponse.json({
    msg_welcome_menu: data?.msg_welcome_menu?.trim() || DEFAULT_WELCOME_MENU,
  });
}
