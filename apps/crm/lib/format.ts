import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

/** Iniciales para el avatar fallback. */
export function initials(name: string | null, phone: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  // Sin nombre: ultimos 2 digitos del telefono.
  return phone.slice(-2);
}

/** "hace 5 minutos" o "-" si no hay fecha. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return "-";
  }
}

/** Hora corta para burbujas de chat (ej: "14:32"). Usa la TZ del navegador. */
export function shortTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd/MM HH:mm", { locale: es });
  } catch {
    return "";
  }
}

/**
 * Hora corta en horario de Argentina (ej: "14:32"), fija sin importar la TZ
 * del proceso. Para tablas renderizadas en el servidor (el VPS corre en
 * UTC) donde no hay navegador que aplique la TZ local, como /logs.
 */
export function shortTimeAR(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** "YYYY-MM-DD" de una fecha en una TZ dada (default AR). Para el día de agenda. */
export function ymdInTZ(
  date: Date = new Date(),
  timeZone = "America/Argentina/Buenos_Aires",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA => "YYYY-MM-DD"
}

/** Hora "HH:MM" de un ISO en una TZ (default AR). */
export function timeInTZ(
  iso: string | null,
  timeZone = "America/Argentina/Buenos_Aires",
): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Etiqueta de día "lun 15/01" de un "YYYY-MM-DD". */
export function dayLabel(ymd: string): string {
  try {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "UTC",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(dt);
  } catch {
    return ymd;
  }
}

/** Suma días a un "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export const APPOINTMENT_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  held: { label: "Retenido", className: "bg-purple-100 text-purple-800 border-purple-200" },
  pending: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  confirmed: { label: "Confirmado", className: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Cancelado", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  completed: { label: "Atendido", className: "bg-blue-100 text-blue-800 border-blue-200" },
  no_show: { label: "Ausente", className: "bg-red-100 text-red-800 border-red-200" },
  rescheduled: { label: "Reprogramado", className: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export const SYNC_STATUS_META: Record<string, { label: string; className: string }> = {
  disabled: { label: "—", className: "text-zinc-400" },
  pending: { label: "Sync pendiente", className: "text-amber-600" },
  synced: { label: "Sincronizado", className: "text-green-600" },
  failed: { label: "Error de sync", className: "text-red-600" },
};

export type Status = "new" | "active" | "resolved" | "archived";

export const STATUS_META: Record<Status, { label: string; className: string }> = {
  new: { label: "Nuevo", className: "bg-blue-100 text-blue-800 border-blue-200" },
  active: { label: "Activo", className: "bg-green-100 text-green-800 border-green-200" },
  resolved: { label: "Resuelto", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  archived: { label: "Archivado", className: "bg-amber-100 text-amber-800 border-amber-200" },
};

export const STATUS_ORDER: Status[] = ["new", "active", "resolved", "archived"];

export function normalizeStatus(value: string | null): Status {
  return value === "active" || value === "resolved" || value === "archived"
    ? value
    : "new";
}
