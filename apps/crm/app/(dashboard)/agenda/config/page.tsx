import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";
import { ConfigManager } from "./config-manager";

export const dynamic = "force-dynamic";

export default async function AgendaConfigPage() {
  const profile = await getCurrentProfile();
  const tenant = profile?.tenant ?? null;
  if (!tenant) redirect("/contacts");

  const supabase = await createClient();

  const [
    { data: settings },
    { data: specialties },
    { data: treatments },
    { data: professionals },
    { data: profTreatments },
    { data: profSpecialties },
    { data: schedules },
    { data: exceptions },
  ] = await Promise.all([
    supabase.from("appointment_settings").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("specialties").select("*").eq("tenant_id", tenant.id).order("name"),
    supabase.from("treatments").select("*").eq("tenant_id", tenant.id).order("name"),
    supabase.from("professionals").select("*").eq("tenant_id", tenant.id).order("first_name"),
    supabase.from("professional_treatments").select("*"),
    supabase.from("professional_specialties").select("*"),
    supabase.from("professional_schedules").select("*").eq("tenant_id", tenant.id),
    supabase.from("availability_exceptions").select("*").eq("tenant_id", tenant.id).order("date"),
  ]);

  return (
    <div className="h-full overflow-auto p-6">
      <ConfigManager
        tenantName={tenant.name}
        settings={settings ?? null}
        specialties={specialties ?? []}
        treatments={treatments ?? []}
        professionals={professionals ?? []}
        profTreatments={profTreatments ?? []}
        profSpecialties={profSpecialties ?? []}
        schedules={schedules ?? []}
        exceptions={exceptions ?? []}
      />
    </div>
  );
}
