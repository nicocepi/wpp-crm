import { createClient } from "@/lib/supabase/server";

const TZ = "America/Argentina/Buenos_Aires";
const PERIOD_DAYS = 30;
const BYDAY_DAYS = 14;

/** Clave de día (YYYY-MM-DD) en timezone AR — evita el bug de "hoy" en UTC. */
function dayKeyAR(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "hoy" en AR como YYYY-MM-DD. */
function todayAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type TenantMetrics = {
  periodDays: number;
  flowType: string;
  inbound: {
    total: number;
    contacts: number;
    today: number;
    byDay: { day: string; count: number }[];
  };
  topReasons: { title: string; count: number }[];
  handoff: { totalContacts: number; handoffContacts: number; ratio: number };
  failed: {
    total: number;
    recent: { content: string | null; error: string | null; created_at: string | null }[];
  };
};

/**
 * KPIs operativos de UN tenant. Scoped por RLS (sesion) + filtro explicito
 * .eq(tenant_id) como defensa en profundidad. Agrega en JS (bajo volumen).
 */
export async function getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
  const supabase = await createClient();

  const since = new Date(
    Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const today = todayAR();

  const [inboundRes, eventsRes, contactsRes, failedCountRes, failedRecentRes, cfgRes] =
    await Promise.all([
      supabase
        .from("messages")
        .select("sent_at, contact_id")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .gte("sent_at", since),
      supabase
        .from("event_logs")
        .select("data")
        .eq("tenant_id", tenantId)
        .eq("event", "menu_decision")
        .gte("created_at", since),
      supabase.from("contacts").select("handoff").eq("tenant_id", tenantId),
      supabase
        .from("failed_messages")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("failed_messages")
        .select("content, error, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("bot_configs")
        .select("flow_type")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

  // --- Cuánta gente escribió (mensajes entrantes) ---
  const inboundRows = inboundRes.data ?? [];
  const byDayMap = new Map<string, number>();
  const uniqueContacts = new Set<string>();
  let todayCount = 0;
  for (const row of inboundRows) {
    if (!row.sent_at) continue;
    const day = dayKeyAR(row.sent_at);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
    if (row.contact_id) uniqueContacts.add(row.contact_id);
    if (day === today) todayCount += 1;
  }
  // Serie de los últimos BYDAY_DAYS días (rellena huecos con 0).
  const byDay: { day: string; count: number }[] = [];
  for (let i = BYDAY_DAYS - 1; i >= 0; i--) {
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    byDay.push({ day: d, count: byDayMap.get(d) ?? 0 });
  }

  // --- Top motivos (último paso del path de cada menu_decision) ---
  const reasonMap = new Map<string, number>();
  for (const row of eventsRes.data ?? []) {
    const data = row.data as { path?: unknown } | null;
    const path = Array.isArray(data?.path) ? (data!.path as unknown[]) : [];
    if (path.length === 0) continue;
    const last = path[path.length - 1];
    if (typeof last !== "string" || !last.trim()) continue;
    reasonMap.set(last, (reasonMap.get(last) ?? 0) + 1);
  }
  const topReasons = [...reasonMap.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- % handoff ---
  const contactsRows = contactsRes.data ?? [];
  const totalContacts = contactsRows.length;
  const handoffContacts = contactsRows.filter((c) => c.handoff === true).length;
  const ratio = totalContacts > 0 ? handoffContacts / totalContacts : 0;

  return {
    periodDays: PERIOD_DAYS,
    flowType: cfgRes.data?.flow_type ?? "ai",
    inbound: {
      total: inboundRows.length,
      contacts: uniqueContacts.size,
      today: todayCount,
      byDay,
    },
    topReasons,
    handoff: { totalContacts, handoffContacts, ratio },
    failed: {
      total: failedCountRes.count ?? 0,
      recent: failedRecentRes.data ?? [],
    },
  };
}
