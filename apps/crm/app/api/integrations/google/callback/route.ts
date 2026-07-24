import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/tenant";
import { exchangeCodeForTokens, fetchGoogleAccountEmail } from "@/lib/appointments/gcal-client";
import { encryptToken } from "@/lib/appointments/gcal-crypto";
import { GCAL_STATE_COOKIE } from "@/lib/appointments/gcal-oauth-state";

export const dynamic = "force-dynamic";

function clear(res: NextResponse): NextResponse {
  res.cookies.set(GCAL_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

/** Callback de Google: intercambia el code por tokens, los cifra y los guarda. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const configUrl = (query: string) => new URL(`/agenda/config${query}`, url);

  const raw = (await cookies()).get(GCAL_STATE_COOKIE)?.value;
  let saved: { nonce: string; tenantId: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }

  if (!code || !returnedState || !saved || saved.nonce !== returnedState) {
    return clear(NextResponse.redirect(configUrl("?gcal_error=estado_invalido")));
  }

  // Defensa en profundidad: el usuario logueado debe tener acceso a ese tenant
  // (el suyo propio, o cualquiera si es admin global).
  const profile = await getCurrentProfile();
  if (!profile || (profile.tenant?.id !== saved.tenantId && profile.role !== "admin")) {
    return clear(NextResponse.redirect(configUrl("?gcal_error=no_autorizado")));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Sin refresh_token (Google no lo re-emite sin prompt=consent en cuentas
      // que ya habían autorizado antes) -> pedimos reconectar.
      return clear(NextResponse.redirect(configUrl("?gcal_error=sin_refresh_token")));
    }

    const email = await fetchGoogleAccountEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const supabase = await createClient();

    const { error } = await supabase.from("gcal_connections").upsert(
      {
        tenant_id: saved.tenantId,
        professional_id: null,
        google_account_email: email,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: expiresAt,
        scopes: tokens.scope,
        calendar_id: "primary",
        status: "connected",
        last_sync_at: null,
      },
      { onConflict: "tenant_id" },
    );
    if (error) throw error;

    return clear(NextResponse.redirect(configUrl("?gcal_connected=1")));
  } catch (e) {
    console.error("[gcal-callback] error", e instanceof Error ? e.message : String(e));
    return clear(NextResponse.redirect(configUrl("?gcal_error=fallo_conexion")));
  }
}
