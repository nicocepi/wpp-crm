import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentProfile } from "@/lib/tenant";
import { buildGoogleAuthUrl } from "@/lib/appointments/gcal-client";
import { GCAL_STATE_COOKIE } from "@/lib/appointments/gcal-oauth-state";

export const dynamic = "force-dynamic";

/**
 * Inicia el flujo OAuth de Google Calendar para el tenant del usuario logueado
 * (el propio, o el impersonado si es admin). Guarda un nonce + tenantId en una
 * cookie httpOnly de corta vida (10 min) para validar el callback (CSRF).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", url));
  if (!profile.tenant) {
    return NextResponse.redirect(new URL("/agenda?gcal_error=sin_tenant", url));
  }

  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthUrl(nonce));
  res.cookies.set(
    GCAL_STATE_COOKIE,
    JSON.stringify({ nonce, tenantId: profile.tenant.id }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    },
  );
  return res;
}
