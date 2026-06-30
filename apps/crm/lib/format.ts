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

/** Hora corta para burbujas de chat (ej: "14:32"). */
export function shortTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd/MM HH:mm", { locale: es });
  } catch {
    return "";
  }
}

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
