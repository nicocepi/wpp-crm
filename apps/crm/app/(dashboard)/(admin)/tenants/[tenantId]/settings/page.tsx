import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BotConfigForm } from "@/components/settings/bot-config-form";
import { Button } from "@/components/ui/button";
import { LogoUploader } from "./logo-uploader";
import type { BotConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TenantSettingsPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, logo_url")
    .eq("id", params.tenantId)
    .maybeSingle();

  if (!tenant) notFound();

  const { data: config } = await supabase
    .from("bot_configs")
    .select("*")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/tenants">
          <ArrowLeft className="h-4 w-4" /> Volver a tenants
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Configuración del tenant</h1>
        <p className="text-sm text-muted-foreground">Tenant: {tenant.name}</p>
      </div>

      <div className="mb-6 rounded-lg border p-4">
        <LogoUploader tenantId={tenant.id} logoUrl={tenant.logo_url} />
      </div>

      <BotConfigForm
        config={(config as BotConfig | null) ?? null}
        tenantId={tenant.id}
      />
    </div>
  );
}
