import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { UsersManager, type TenantUser } from "./users-manager";

export const dynamic = "force-dynamic";

export default async function TenantUsersPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("id", params.tenantId)
    .maybeSingle();
  if (!tenant) notFound();

  const profile = await getCurrentProfile();

  // Listado con service role (Auth admin) para resolver emails.
  const admin = createAdminClient();
  const [{ data: profiles }, { data: authList }] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, role, created_at, display_name")
      .eq("tenant_id", tenant.id),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const emailById = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? "—"]),
  );
  const users: TenantUser[] = (profiles ?? [])
    .map((p) => ({
      userId: p.user_id,
      email: emailById.get(p.user_id) ?? "—",
      role: p.role,
      displayName: p.display_name ?? null,
      createdAt: p.created_at,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/tenants">
          <ArrowLeft className="h-4 w-4" /> Volver a tenants
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Tenant: {tenant.name}</p>
      </div>
      <UsersManager
        tenantId={tenant.id}
        users={users}
        currentUserId={profile?.userId ?? ""}
      />
    </div>
  );
}
