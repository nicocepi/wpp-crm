import { getCurrentTenant } from "@/lib/tenant";
import { getTenantMetrics } from "@/lib/tenant-metrics";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// Etiqueta corta de día (ej "mar 12") para las barras de volumen.
function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
  }).format(dt);
}

export default async function MetricsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-semibold">Métricas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ingresá como un tenant para ver sus métricas.
        </p>
      </div>
    );
  }

  const m = await getTenantMetrics(tenant.id);
  const maxDay = Math.max(1, ...m.inbound.byDay.map((d) => d.count));
  const maxReason = Math.max(1, ...m.topReasons.map((r) => r.count));
  const handoffPct = Math.round(m.handoff.ratio * 100);
  const botResolved = m.handoff.totalContacts - m.handoff.handoffContacts;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Métricas · {tenant.name}</h1>
        <p className="text-sm text-muted-foreground">
          Últimos {m.periodDays} días.
        </p>
      </div>

      {/* Resumen en lenguaje claro */}
      <div className="mb-8 rounded-lg border bg-background p-4 text-sm">
        <span className="font-medium">Hoy escribieron {m.inbound.today}</span>{" "}
        {m.inbound.today === 1 ? "persona" : "personas"}
        {" · "}
        derivadas a un agente{" "}
        <span className={m.handoff.handoffContacts ? "text-amber-600" : ""}>
          {m.handoff.handoffContacts}
        </span>
        {" · "}
        sin entregar{" "}
        <span className={m.failed.total ? "text-red-600" : ""}>
          {m.failed.total}
        </span>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Personas (período)" value={m.inbound.contacts} />
        <Kpi label="Mensajes recibidos" value={m.inbound.total} />
        <Kpi
          label="Derivados a agente"
          value={m.handoff.handoffContacts}
          accent={m.handoff.handoffContacts ? "amber" : undefined}
        />
        <Kpi
          label="Mensajes fallidos"
          value={m.failed.total}
          accent={m.failed.total ? "red" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cuánta gente escribió (por día) */}
        <Section title="Cuánta gente escribió" hint="Mensajes recibidos por día (últimos 14)">
          <div className="space-y-1.5">
            {m.inbound.byDay.map((d) => (
              <div key={d.day} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">
                  {dayLabel(d.day)}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${(d.count / maxDay) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums">
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* Top motivos */}
        <Section title="Top motivos" hint="Temas más consultados en el menú">
          {m.topReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.flowType === "menu"
                ? "Todavía no hay consultas registradas en el menú."
                : "Disponible para tenants con flujo de menú."}
            </p>
          ) : (
            <div className="space-y-2">
              {m.topReasons.map((r) => (
                <div key={r.title} className="text-xs">
                  <div className="mb-0.5 flex justify-between">
                    <span className="truncate pr-2">{r.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.count}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-indigo-500/70"
                      style={{ width: `${(r.count / maxReason) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Bot vs agente */}
        <Section title="Bot vs. agente" hint="Cuánto resolvió el bot sin intervención">
          {m.handoff.totalContacts === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos todavía.</p>
          ) : (
            <>
              <p className="text-sm">
                El bot resolvió{" "}
                <span className="font-semibold">{botResolved}</span> · derivaron a
                un agente{" "}
                <span className="font-semibold text-amber-600">
                  {m.handoff.handoffContacts}
                </span>{" "}
                ({handoffPct}%)
              </p>
              <div className="mt-3 flex h-4 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-emerald-500/70"
                  style={{ width: `${100 - handoffPct}%` }}
                  title={`Bot: ${100 - handoffPct}%`}
                />
                <div
                  className="h-full bg-amber-500/80"
                  style={{ width: `${handoffPct}%` }}
                  title={`Agente: ${handoffPct}%`}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sobre {m.handoff.totalContacts} contactos.
              </p>
            </>
          )}
        </Section>

        {/* Mensajes que no llegaron */}
        <Section title="Mensajes que no llegaron" hint="Envíos rechazados (ej. fuera de la ventana de 24h)">
          {m.failed.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos los mensajes se entregaron. 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {m.failed.recent.map((f, i) => (
                <li key={i} className="border-b pb-2 text-xs last:border-0">
                  <p className="truncate text-foreground">
                    {f.content ?? "(sin contenido)"}
                  </p>
                  <p className="text-muted-foreground">
                    {f.error ? f.error + " · " : ""}
                    {relativeTime(f.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Kpi({
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
    <div className="rounded-lg border bg-background p-3">
      <p className={"text-2xl font-semibold " + color}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
