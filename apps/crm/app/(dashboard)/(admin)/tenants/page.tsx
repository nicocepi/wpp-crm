import Link from "next/link";
import { Settings, Users, Phone, LogIn } from "lucide-react";
import { getTenantStats } from "@/lib/admin-stats";
import { Button } from "@/components/ui/button";
import { impersonateTenant } from "@/app/(dashboard)/actions";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const stats = await getTenantStats();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          {stats.length} {stats.length === 1 ? "tenant" : "tenants"} · datos
          principales y acceso a configuración.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {stats.map((s) => (
          <div key={s.tenant.id} className="rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.tenant.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> {s.tenant.whatsapp_phone_id}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (s.flowType === "menu"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-sky-100 text-sky-700")
                  }
                >
                  {s.flowType === "menu" ? "Menú" : "IA"}
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (s.botEnabled
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-600")
                  }
                >
                  {s.botEnabled ? "Bot on" : "Bot off"}
                </span>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <Metric label="Contactos" value={s.contacts} />
              <Metric label="Necesita agente" value={s.handoff} accent="amber" />
              <Metric label="Urgentes" value={s.urgent} accent="red" />
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/tenants/${s.tenant.id}/settings`}>
                    <Settings className="h-3.5 w-3.5" /> Configurar
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link href={`/tenants/${s.tenant.id}/users`}>
                    <Users className="h-3.5 w-3.5" /> Usuarios
                  </Link>
                </Button>
              </div>
              <form action={impersonateTenant}>
                <input type="hidden" name="tenant_id" value={s.tenant.id} />
                <Button type="submit" size="sm" className="w-full">
                  <LogIn className="h-3.5 w-3.5" /> Ingresar como este tenant
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "red";
}) {
  const color =
    accent === "amber"
      ? "text-amber-600"
      : accent === "red"
        ? "text-red-600"
        : "text-foreground";
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className={"text-lg font-semibold " + color}>{value}</p>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
