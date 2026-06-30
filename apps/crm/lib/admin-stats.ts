import { createClient } from "@/lib/supabase/server";
import { isHandoff, isUrgent, type Tenant } from "@/lib/types";

export type TenantStat = {
  tenant: Tenant;
  flowType: string;
  botEnabled: boolean;
  contacts: number;
  handoff: number;
  urgent: number;
  active: number;
  resolved: number;
  newToday: number;
  new7d: number;
  lastMessageAt: string | null;
  messagesTotal: number;
  messages7d: number;
  failed: number;
};

/**
 * Calcula KPIs por tenant para las vistas de admin. Requiere sesion admin
 * (RLS con OR is_admin() habilita la lectura cross-tenant).
 */
export async function getTenantStats(): Promise<TenantStat[]> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const [{ data: tenants }, { data: contacts }, { data: configs }] =
    await Promise.all([
      supabase.from("tenants").select("*").order("name"),
      supabase
        .from("contacts")
        .select("tenant_id, status, flow_state, created_at, last_message_at"),
      supabase.from("bot_configs").select("tenant_id, enabled, flow_type"),
    ]);

  const configByTenant = new Map(
    (configs ?? []).map((c) => [c.tenant_id, c]),
  );

  // Agregados de contactos en JS (evita N queries por tenant).
  const agg = new Map<
    string,
    Omit<
      TenantStat,
      | "tenant"
      | "flowType"
      | "botEnabled"
      | "messagesTotal"
      | "messages7d"
      | "failed"
    >
  >();
  const empty = () => ({
    contacts: 0,
    handoff: 0,
    urgent: 0,
    active: 0,
    resolved: 0,
    newToday: 0,
    new7d: 0,
    lastMessageAt: null as string | null,
  });

  for (const c of contacts ?? []) {
    const a = agg.get(c.tenant_id) ?? empty();
    a.contacts += 1;
    if (isHandoff(c)) a.handoff += 1;
    if (isUrgent(c)) a.urgent += 1;
    if (c.status === "active") a.active += 1;
    if (c.status === "resolved") a.resolved += 1;
    if (c.created_at && c.created_at >= todayStartIso) a.newToday += 1;
    if (c.created_at && c.created_at >= sevenDaysAgo) a.new7d += 1;
    if (c.last_message_at && (!a.lastMessageAt || c.last_message_at > a.lastMessageAt)) {
      a.lastMessageAt = c.last_message_at;
    }
    agg.set(c.tenant_id, a);
  }

  // Conteos de mensajes y fallidos por tenant (pocas tablas grandes -> count head).
  const stats = await Promise.all(
    (tenants ?? []).map(async (tenant) => {
      const [{ count: messagesTotal }, { count: messages7d }, { count: failed }] =
        await Promise.all([
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .gte("sent_at", sevenDaysAgo),
          supabase
            .from("failed_messages")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenant.id),
        ]);

      const a = agg.get(tenant.id) ?? empty();
      const cfg = configByTenant.get(tenant.id);
      return {
        tenant,
        flowType: cfg?.flow_type ?? "ai",
        botEnabled: cfg?.enabled !== false,
        messagesTotal: messagesTotal ?? 0,
        messages7d: messages7d ?? 0,
        failed: failed ?? 0,
        ...a,
      } satisfies TenantStat;
    }),
  );

  return stats;
}
