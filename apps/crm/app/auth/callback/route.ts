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
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
