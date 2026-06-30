import { getTenantStats } from "@/lib/admin-stats";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await getTenantStats();

  // Totales globales.
  const total = stats.reduce(
    (acc, s) => ({
      contacts: acc.contacts + s.contacts,
      handoff: acc.handoff + s.handoff,
      urgent: acc.urgent + s.urgent,
      messages7d: acc.messages7d + s.messages7d,
      new7d: acc.new7d + s.new7d,
      failed: acc.failed + s.failed,
    }),
    { contacts: 0, handoff: 0, urgent: 0, messages7d: 0, new7d: 0, failed: 0 },
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Estadísticas</h1>
        <p className="text-sm text-muted-foreground">
          KPIs por tenant y totales globales.
        </p>
      </div>

      {/* Totales globales */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Contactos" value={total.contacts} />
        <Kpi label="Necesita agente" value={total.handoff} accent="amber" />
        <Kpi label="Urgentes" value={total.urgent} accent="red" />
        <Kpi label="Nuevos (7d)" value={total.new7d} />
        <Kpi label="Mensajes (7d)" value={total.messages7d} />
        <Kpi label="Fallidos" value={total.failed} accent={total.failed ? "red" : undefined} />
      </div>

      {/* Tabla por tenant */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <Th>Tenant</Th>
              <Th>Bot</Th>
              <Th right>Contactos</Th>
              <Th right>Activos</Th>
              <Th right>Resueltos</Th>
              <Th right>Necesita agente</Th>
              <Th right>Urgentes</Th>
              <Th right>Nuevos hoy</Th>
              <Th right>Nuevos 7d</Th>
              <Th right>Msg total</Th>
              <Th right>Msg 7d</Th>
              <Th right>Fallidos</Th>
              <Th>Último mensaje</Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.tenant.id} className="border-t">
                <Td>
                  <span className="font-medium">{s.tenant.name}</span>
                </Td>
                <Td>
                  <span className="text-xs text-muted-foreground">
                    {s.flowType === "menu" ? "Menú" : "IA"} ·{" "}
                    {s.botEnabled ? "on" : "off"}
                  </span>
                </Td>
                <Td right>{s.contacts}</Td>
                <Td right>{s.active}</Td>
                <Td right>{s.resolved}</Td>
                <Td right accent={s.handoff ? "amber" : undefined}>
                  {s.handoff}
                </Td>
                <Td right accent={s.urgent ? "red" : undefined}>
                  {s.urgent}
                </Td>
                <Td right>{s.newToday}</Td>
                <Td right>{s.new7d}</Td>
                <Td right>{s.messagesTotal}</Td>
                <Td right>{s.messages7d}</Td>
                <Td right accent={s.failed ? "red" : undefined}>
                  {s.failed}
                </Td>
                <Td>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(s.lastMessageAt)}
                  </span>
                </Td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td
                  colSpan={13}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Sin tenants.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

function Th({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th className={"px-3 py-2 font-medium " + (right ? "text-right" : "")}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  accent,
}: {
  children: React.ReactNode;
  right?: boolean;
  accent?: "amber" | "red";
}) {
  const color =
    accent === "amber"
      ? "text-amber-600 font-medium"
      : accent === "red"
        ? "text-red-600 font-medium"
        : "";
  return (
    <td className={"px-3 py-2 " + (right ? "text-right " : "") + color}>
      {children}
    </td>
  );
}
