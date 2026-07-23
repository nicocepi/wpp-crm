/**
 * Cliente de Google OAuth + Calendar API. Usa `fetch` nativo (sin SDK de
 * Google) para no agregar dependencias pesadas — la superficie que
 * necesitamos (token exchange/refresh + CRUD de eventos) es chica.
 *
 * Nunca loguear tokens completos ni el body de las respuestas de OAuth.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
// Scopes mínimos: crear/editar/borrar eventos (no acceso total al calendario)
// + listar los calendarios de la cuenta de solo lectura (para el selector del
// panel; no permite modificar calendarios, solo verlos).
const SCOPES =
  "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // fuerza refresh_token también en reconexiones
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string; // solo viene en el primer consent
  expires_in: number; // segundos
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`google_token_exchange_failed:${res.status}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // invalid_grant = token revocado o vencido más allá de lo recuperable.
    if (body.includes("invalid_grant")) throw new Error("google_token_revoked");
    throw new Error(`google_token_refresh_failed:${res.status}`);
  }
  return res.json();
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

export type GcalCalendarOption = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
};

/** Lista los calendarios de la cuenta conectada (para el selector del panel).
 *  Solo los que permiten escribir eventos (writer/owner). */
export async function listCalendars(accessToken: string): Promise<GcalCalendarOption[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw { status: res.status, body: await res.text().catch(() => "") } as GcalApiError;
  const data = await res.json();
  return (data.items ?? []).map((c: { id: string; summary: string; primary?: boolean; accessRole: string }) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary,
    accessRole: c.accessRole,
  }));
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(
    () => {
      /* best-effort: si falla la revocación remota, igual desconectamos localmente */
    },
  );
}

// --- Eventos de calendario --------------------------------------------------

export type GcalEventInput = {
  summary: string; // ej: "Turno: Limpieza dental — Ana Pérez" (sin datos clínicos)
  description?: string;
  startAtIso: string;
  endAtIso: string;
  appointmentId: string; // metadata privada, para vincular evento↔turno de forma confiable
  tenantId: string;
};

type GcalApiError = { status: number; body: string };

function isGcalApiError(e: unknown): e is GcalApiError {
  return typeof e === "object" && e !== null && "status" in e;
}
export { isGcalApiError };

async function gcalFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw { status: res.status, body } as GcalApiError;
  }
  return res;
}

function eventPayload(input: GcalEventInput) {
  return {
    summary: input.summary,
    description: input.description ?? undefined,
    start: { dateTime: input.startAtIso },
    end: { dateTime: input.endAtIso },
    // Metadata privada para vincular el evento con el turno interno de forma
    // confiable (no solo por título). No incluye información clínica.
    extendedProperties: {
      private: {
        crm_appointment_id: input.appointmentId,
        crm_tenant_id: input.tenantId,
      },
    },
  };
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GcalEventInput,
): Promise<{ eventId: string }> {
  const res = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(eventPayload(input)),
  });
  const data = await res.json();
  return { eventId: data.id };
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: GcalEventInput,
): Promise<void> {
  await gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(eventPayload(input)) },
  );
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await gcalFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  } catch (e) {
    // 410/404 = ya no existe (borrado a mano en Google) -> no es un error real.
    if (isGcalApiError(e) && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}
