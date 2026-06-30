import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getCurrentProfile();
  // El admin arranca en la vista de tenants; el resto en sus contactos.
  redirect(profile?.role === "admin" ? "/tenants" : "/contacts");
}
