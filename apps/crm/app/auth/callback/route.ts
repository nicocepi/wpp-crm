import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback del magic link: intercambia el code por una sesion y redirige.
 * Docs: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
/** Solo rutas internas: evita open redirect (//evil.com, /\evil.com, http://...). */
function safeNext(raw: string | null): string {
  if (!raw) return "/contacts";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/contacts";
  }
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  // request.url no refleja el Host real detras de un reverse proxy: "next start"
  // construye la URL con el hostname/puerto del bind (localhost:3000), no con el
  // header Host de la request entrante. Reconstruimos el origin publico desde
  // los headers forwarded (Cloudflare/Caddy los setean).
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
