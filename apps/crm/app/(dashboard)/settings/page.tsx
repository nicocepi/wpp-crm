import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// La configuracion dejo de ser una seccion suelta: el admin la edita por tenant
// desde /tenants. Esta ruta solo redirige.
export default async function SettingsRedirect() {
  redirect((await isAdmin()) ? "/tenants" : "/contacts");
}
