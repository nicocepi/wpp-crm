import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getCurrentProfile();
  // Admin (sin impersonar) arranca en tenants; el resto en sus contactos.
  const toTenants = profile?.role === "admin" && !profile.impersonating;
  redirect(toTenants ? "/tenants" : "/contacts");
}
