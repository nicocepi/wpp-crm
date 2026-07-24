import { NextResponse } from "next/server";
import { adminClient, assertModuleEnabled, badRequest, checkSecret, unauthorized } from "@/lib/appointments/internal";

export const dynamic = "force-dynamic";

/** Catálogo tenant-scoped para el flujo de WhatsApp: especialidades,
 *  tratamientos (por especialidad) y profesionales (por tratamiento). */
export async function POST(req: Request) {
  if (!checkSecret(req)) return unauthorized();
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return badRequest("Body inválido");
  }
  const tenantId = String(b.tenant_id ?? "");
  const kind = String(b.kind ?? "");
  if (!tenantId || !kind) return badRequest("Faltan tenant_id o kind");

  const supabase = adminClient();
  const enabled = await assertModuleEnabled(supabase, tenantId);
  if (!enabled.ok) return NextResponse.json({ error: enabled.error }, { status: 403 });

  if (kind === "specialties") {
    const { data } = await supabase
      .from("specialties")
      .select("id, name, description")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name");
    return NextResponse.json({ specialties: data ?? [] });
  }

  if (kind === "treatments") {
    let q = supabase
      .from("treatments")
      .select("id, name, description, duration_minutes, specialty_id")
      .eq("tenant_id", tenantId)
      .eq("active", true);
    if (b.specialty_id) q = q.eq("specialty_id", String(b.specialty_id));
    const { data } = await q.order("name");
    return NextResponse.json({ treatments: data ?? [] });
  }

  if (kind === "professionals") {
    // Profesionales habilitados para un tratamiento (o todos los activos).
    if (b.treatment_id) {
      const { data: links } = await supabase
        .from("professional_treatments")
        .select("professional_id")
        .eq("treatment_id", String(b.treatment_id));
      const ids = (links ?? []).map((l) => l.professional_id);
      if (ids.length === 0) return NextResponse.json({ professionals: [] });
      const { data } = await supabase
        .from("professionals")
        .select("id, first_name, last_name")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .in("id", ids)
        .order("first_name");
      return NextResponse.json({ professionals: data ?? [] });
    }
    const { data } = await supabase
      .from("professionals")
      .select("id, first_name, last_name")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("first_name");
    return NextResponse.json({ professionals: data ?? [] });
  }

  return badRequest("kind inválido (specialties|treatments|professionals)");
}
