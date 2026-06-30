import { MessageCircle, LogOut, Eye } from "lucide-react";
import { getCurrentProfile } from "@/lib/tenant";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";
import { signOut, stopImpersonating } from "./actions";

const MEMBER_NAV: NavItem[] = [
  { href: "/contacts", label: "Contactos", icon: "contacts" },
];
const ADMIN_NAV: NavItem[] = [
  { href: "/tenants", label: "Tenants", icon: "tenants" },
  { href: "/stats", label: "Estadisticas", icon: "stats" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const tenant = profile?.tenant ?? null;
  const isAdmin = profile?.role === "admin";
  const impersonating = profile?.impersonating ?? false;
  // Mientras impersona, el admin ve/usa lo mismo que un member.
  const memberView = impersonating || !isAdmin;

  // Member sin tenant asignado (el admin sin tenant es valido, sigue de largo).
  if (!tenant && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Tu usuario no tiene un tenant asignado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Pedile a un admin que te asigne a un tenant.
        </p>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            <LogOut className="h-4 w-4" /> Cerrar sesion
          </Button>
        </form>
      </main>
    );
  }

  const headerName = memberView && tenant ? tenant.name : "Admin";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{headerName}</p>
            <p className="text-xs text-muted-foreground">WhatsApp CRM</p>
          </div>
        </div>
        <SidebarNav items={memberView ? MEMBER_NAV : ADMIN_NAV} />
        <div className="mt-auto border-t p-2">
          <form action={signOut}>
            <Button
              variant="ghost"
              type="submit"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesion
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden bg-muted/20">
        {impersonating && tenant && (
          <div className="flex items-center justify-between gap-2 border-b bg-indigo-600 px-4 py-2 text-sm text-white">
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Estás viendo como{" "}
              <strong>{tenant.name}</strong>
            </span>
            <form action={stopImpersonating}>
              <button
                type="submit"
                className="rounded bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
              >
                Salir
              </button>
            </form>
          </div>
        )}
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}

export const dynamic = "force-dynamic";
