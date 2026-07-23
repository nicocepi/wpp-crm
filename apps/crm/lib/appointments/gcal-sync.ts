import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decryptToken, encryptToken } from "./gcal-crypto";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  isGcalApiError,
  listCalendars,
  refreshAccessToken,
  updateCalendarEvent,
  type GcalCalendarOption,
  type GcalEventInput,
} from "./gcal-client";

type DB = SupabaseClient<Database>;

export type SyncOperation = "create" | "update" | "delete";

type SyncCtx = {
  source?: "crm" | "n8n";
  userId?: string | null;
  correlationId?: string | null;
};

async function logEvent(
  supabase: DB,
  tenantId: string,
  event: string,
  level: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown>,
  ctx: SyncCtx,
) {
  try {
    await supabase.from("event_logs").insert({
      tenant_id: tenantId,
      source: ctx.source ?? "crm",
      level,
      event,
      message,
      data: { ...data, correlation_id: ctx.correlationId ?? null } as never,
    });
  } catch {
    /* el logging nunca debe romper la operación */
  }
}

async function writeOutbox(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  operation: SyncOperation,
  status: "synced" | "failed",
  error: string | null,
  ctx: SyncCtx,
) {
  await supabase.from("gcal_sync_outbox").insert({
    tenant_id: tenantId,
    appointment_id: appointmentId,
    operation,
    status,
    attempts: 1,
    last_error: error,
    correlation_id: ctx.correlationId ?? null,
  });
}

/**
 * Devuelve un access_token válido para el tenant, refrescándolo si venció.
 * Si el refresh_token fue revocado, marca la conexión en estado 'error'.
 */
export async function getValidAccessToken(
  supabase: DB,
  tenantId: string,
): Promise<
  | { ok: true; accessToken: string; calendarId: string }
  | { ok: false; error: "not_connected" | "token_revoked" | "refresh_failed" }
> {
  const { data: conn } = await supabase
    .from("gcal_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!conn || conn.status !== "connected" || !conn.refresh_token_encrypted) {
    return { ok: false, error: "not_connected" };
  }

  const bufferMs = 60_000;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token_encrypted && expiresAt > Date.now() + bufferMs) {
    return { ok: true, accessToken: decryptToken(conn.access_token_encrypted), calendarId: conn.calendar_id ?? "primary" };
  }

  try {
    const refreshToken = decryptToken(conn.refresh_token_encrypted);
    const tokens = await refreshAccessToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabase
      .from("gcal_connections")
      .update({
        access_token_encrypted: encryptToken(tokens.access_token),
        // Google normalmente no rota el refresh_token; si viene uno nuevo, lo guardamos.
        refresh_token_encrypted: tokens.refresh_token
          ? encryptToken(tokens.refresh_token)
          : conn.refresh_token_encrypted,
        token_expires_at: newExpiresAt,
      })
      .eq("tenant_id", tenantId);
    return { ok: true, accessToken: tokens.access_token, calendarId: conn.calendar_id ?? "primary" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "google_token_revoked") {
      await supabase.from("gcal_connections").update({ status: "error" }).eq("tenant_id", tenantId);
      return { ok: false, error: "token_revoked" };
    }
    return { ok: false, error: "refresh_failed" };
  }
}

/**
 * Intenta sincronizar un turno con Google Calendar (create/update/delete).
 * No-op silencioso si el tenant no tiene gcal_sync_enabled o no está conectado
 * (el turno interno nunca depende de que esto tenga éxito). Actualiza
 * appointments.sync_status/gcal_event_id/sync_error/synced_at y escribe en el
 * outbox + event_logs para trazabilidad. correlation_id viaja de punta a punta.
 */
export async function attemptGcalSync(
  supabase: DB,
  tenantId: string,
  appointmentId: string,
  operation: SyncOperation,
  ctx: SyncCtx = {},
): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("gcal_sync_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!settings?.gcal_sync_enabled) return { attempted: false, ok: true };

  const { data: appt } = await supabase
    .from("appointments")
    .select("*, treatments(name), professionals(first_name,last_name), contacts(name,phone)")
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { attempted: false, ok: false, error: "appointment_not_found" };

  if (operation === "delete" && !appt.gcal_event_id) {
    return { attempted: false, ok: true }; // nada que borrar
  }

  const tokenRes = await getValidAccessToken(supabase, tenantId);
  if (!tokenRes.ok) {
    await supabase
      .from("appointments")
      .update({ sync_status: "failed", sync_error: tokenRes.error })
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId);
    await writeOutbox(supabase, tenantId, appointmentId, operation, "failed", tokenRes.error, ctx);
    await logEvent(supabase, tenantId, "gcal_sync_error", "warn", `sync falló: ${tokenRes.error}`, { appointment_id: appointmentId, operation }, ctx);
    return { attempted: true, ok: false, error: tokenRes.error };
  }

  const treatmentName = (appt.treatments as { name?: string } | null)?.name ?? "Turno";
  const prof = appt.professionals as { first_name?: string; last_name?: string } | null;
  const profName = prof ? `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() : "";
  const contact = appt.contacts as { name?: string | null; phone?: string | null } | null;
  const contactLabel = contact?.name?.trim() || appt.phone || contact?.phone || "Contacto sin nombre";

  const input: GcalEventInput = {
    summary: `Turno: ${treatmentName}${profName ? ` — ${profName}` : ""}`,
    description: `Contacto: ${contactLabel}\nNo incluye información clínica.`,
    startAtIso: appt.start_at,
    endAtIso: appt.end_at,
    appointmentId,
    tenantId,
  };

  try {
    let eventId = appt.gcal_event_id;
    if (operation === "create" || (operation === "update" && !eventId)) {
      const created = await createCalendarEvent(tokenRes.accessToken, tokenRes.calendarId, input);
      eventId = created.eventId;
    } else if (operation === "update") {
      await updateCalendarEvent(tokenRes.accessToken, tokenRes.calendarId, eventId!, input);
    } else if (operation === "delete") {
      await deleteCalendarEvent(tokenRes.accessToken, tokenRes.calendarId, eventId!);
    }

    await supabase
      .from("appointments")
      .update({
        gcal_event_id: eventId ?? appt.gcal_event_id,
        gcal_calendar_id: tokenRes.calendarId,
        sync_status: "synced",
        sync_error: null,
        synced_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId);
    await writeOutbox(supabase, tenantId, appointmentId, operation, "synced", null, ctx);
    await logEvent(supabase, tenantId, "gcal_sync_ok", "info", `sync ${operation} ok`, { appointment_id: appointmentId, operation }, ctx);
    await supabase.from("gcal_connections").update({ last_sync_at: new Date().toISOString() }).eq("tenant_id", tenantId);
    return { attempted: true, ok: true };
  } catch (e) {
    const errMsg = isGcalApiError(e) ? `gcal_api_${e.status}` : e instanceof Error ? e.message : "gcal_sync_failed";
    await supabase
      .from("appointments")
      .update({ sync_status: "failed", sync_error: errMsg })
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId);
    await writeOutbox(supabase, tenantId, appointmentId, operation, "failed", errMsg, ctx);
    await logEvent(supabase, tenantId, "gcal_sync_error", "warn", `sync falló: ${errMsg}`, { appointment_id: appointmentId, operation }, ctx);
    return { attempted: true, ok: false, error: errMsg };
  }
}

/** Lista los calendarios (con permiso de escritura) de la cuenta conectada, para el selector del panel. */
export async function getAvailableCalendars(
  supabase: DB,
  tenantId: string,
): Promise<{ ok: true; data: GcalCalendarOption[] } | { ok: false; error: string }> {
  const tokenRes = await getValidAccessToken(supabase, tenantId);
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error };
  try {
    const calendars = await listCalendars(tokenRes.accessToken);
    return { ok: true, data: calendars };
  } catch (e) {
    return { ok: false, error: isGcalApiError(e) ? `gcal_api_${e.status}` : "list_calendars_failed" };
  }
}
