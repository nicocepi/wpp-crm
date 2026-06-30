import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback del magic link: intercambia el code por una sesion y redirige.
 * Docs: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/contacts";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
