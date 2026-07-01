import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Cliente Supabase para Server Components / Route Handlers / Server Actions.
 * Lee y escribe la sesion via cookies. RLS activo.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // Impersonacion: si el admin esta "viendo como" un tenant (cookie httpOnly
  // act_as_tenant; ver IMPERSONATE_COOKIE en lib/tenant.ts), reenviamos el
  // tenant en un header. RLS lo honra SOLO si el usuario es admin (is_admin())
  // y desactiva el bypass de admin mientras impersona -> queda acotado por RLS.
  // String literal para evitar import circular con lib/tenant.ts.
  const actAs = cookieStore.get("act_as_tenant")?.value;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll desde un Server Component: lo maneja el middleware (refresh de sesion).
          }
        },
      },
      ...(actAs
        ? { global: { headers: { "x-impersonate-tenant": actAs } } }
        : {}),
    },
  );
}
