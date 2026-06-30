import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Protege todas las rutas de admin (tenants, stats). Defensa además de la RLS. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) redirect("/contacts");
  return <>{children}</>;
}
