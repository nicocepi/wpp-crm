import { createClient } from "@/lib/supabase/server";
import { shortTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVEL_STYLE: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
  debug: "bg-zinc-100 text-zinc-600",
};

type SP = { tenant?: string; level?: string; q?: string };

export default async function LogsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const supabase = await createClient();

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name");
  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  let query = supabase
    .from("event_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (searchParams.tenant) query = query.eq("tenant_id", searchParams.tenant);
  if (searchParams.level) query = query.eq("level", searchParams.level);
  // Sanitiza metacaracteres del lenguaje de filtros de PostgREST antes de
  // interpolarlos en .or() (evita reescribir el predicado).
  const q = searchParams.q?.trim().replace(/[,()\\]/g, "");
  if (q) {
    query = query.or(
      `phone.ilike.%${q}%,event.ilike.%${q}%,message.ilike.%${q}%`,
    );
  }

  const { data: logs } = await query;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Eventos del sistema (flujo, envíos, errores). Últimos 300.
        </p>
      </div>

      {/* Filtros (form GET nativo) */}
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tenant</label>
          <select
            name="tenant"
            defaultValue={searchParams.tenant ?? ""}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos</option>
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Nivel</label>
          <select
            name="level"
            defaultValue={searchParams.level ?? ""}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="debug">debug</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            Buscar (teléfono, evento, mensaje)
          </label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="ej: 549117... o menu_decision"
            className="h-9 w-64 rounded-md border bg-background px-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtrar
        </button>
        <a
          href="/logs"
          className="h-9 rounded-md border px-4 text-sm font-medium leading-9 hover:bg-accent"
        >
          Limpiar
        </a>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 font-medium">Origen</th>
              <th className="px-3 py-2 font-medium">Nivel</th>
              <th className="px-3 py-2 font-medium">Evento</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {shortTime(l.created_at)}
                </td>
                <td className="px-3 py-2 text-xs">
                  {l.tenant_id ? tenantName.get(l.tenant_id) ?? "—" : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{l.source}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (LEVEL_STYLE[l.level] ?? "bg-muted")
                    }
                  >
                    {l.level}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{l.event}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.phone ?? "—"}</td>
                <td className="px-3 py-2">
                  {l.message && (
                    <p className="mb-1 max-w-md truncate text-xs">{l.message}</p>
                  )}
                  {l.data != null && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        data
                      </summary>
                      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(l.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Sin logs para el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
