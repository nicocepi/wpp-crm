import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - api (rutas maquina-a-maquina; validan su propia auth, ej. secreto)
     * - _next/static, _next/image, favicon
     * - archivos estaticos (svg/png/jpg/...)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
