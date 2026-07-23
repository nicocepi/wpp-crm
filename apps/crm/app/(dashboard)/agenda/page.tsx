import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";
import { localWallTimeToUtc } from "@/lib/appointments/availability";
import { addDaysYmd, ymdInTZ } from "@/lib/format";
import { AgendaView } from "./agenda-view";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { date?: string; professional?: string; status?: string };
}) {
  const profile = await getCurrentProfile();
  const tenant = profile?.tenant ?? null;
  if (!tenant) redirect("/contacts");

  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("*")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  // El módulo debe estar habilitado para este tenant.
  if (!settings || !settings.enabled) redirect("/contacts");

  const tz = settings.timezone;
  const day = searchParams.date || ymdInTZ(new Date(), tz);
  const dayStartUtc = localWallTimeToUtc(day, "00:00", tz);
  const dayEndUtc = localWallTimeToUtc(addDaysYmd(day, 1), "00:00", tz);

  const [{ data: professionals }, { data: treatments }, { data: specialties }] =
    await Promise.all([
      supabase.from("professionals").select("*").eq("tenant_id", tenant.id).order("first_name"),
      supabase.from("treatments").select("*").eq("tenant_id", tenant.id).order("name"),
      supabase.from("specialties").select("*").eq("tenant_id", tenant.id).order("name"),
    ]);

  let q = supabase
    .from("appointments")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("start_at", dayStartUtc)
    .lt("start_at", dayEndUtc)
    .order("start_at", { ascending: true });
  if (searchParams.professional) q = q.eq("professional_id", searchParams.professional);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const { data: appointments } = await q;

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      <AgendaView
        tenantName={tenant.name}
        timezone={tz}
        day={day}
        filterProfessional={searchParams.professional ?? ""}
        filterStatus={searchParams.status ?? ""}
        appointments={appointments ?? []}
        professionals={professionals ?? []}
        treatments={treatments ?? []}
        specialties={specialties ?? []}
      />
    </div>
  );
}
