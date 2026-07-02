"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTenantUser,
  deleteTenantUser,
  setTenantUserRole,
  type TenantRole,
} from "./actions";

export type TenantUser = {
  userId: string;
  email: string;
  role: string;
  displayName: string | null;
  createdAt: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  member: "Miembro",
  tenant_admin: "Admin",
  admin: "Admin global",
};

export function UsersManager({
  tenantId,
  users,
  currentUserId,
}: {
  tenantId: string;
  users: TenantUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<TenantRole>("member");
  const [pending, startTransition] = useTransition();

  function add() {
    const value = email.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await createTenantUser(tenantId, value, name.trim(), role);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Usuario agregado");
      setEmail("");
      setName("");
      setRole("member");
      router.refresh();
    });
  }

  function changeRole(u: TenantUser, next: TenantRole) {
    if (next === u.role) return;
    startTransition(async () => {
      const res = await setTenantUserRole(tenantId, u.userId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rol actualizado");
      router.refresh();
    });
  }

  function remove(u: TenantUser) {
    if (!confirm(`¿Eliminar a ${u.email}? Esta acción no se puede deshacer.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteTenantUser(tenantId, u.userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Usuario eliminado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Alta */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">Agregar usuario</p>
        <div className="flex items-end gap-2">
          <Input
            placeholder="Nombre del agente"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="max-w-[40%]"
          />
          <Input
            type="email"
            placeholder="usuario@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TenantRole)}
            className="h-10 rounded-md border bg-background px-2 text-sm"
          >
            <option value="member">Miembro</option>
            <option value="tenant_admin">Admin</option>
          </select>
          <Button onClick={add} disabled={pending || !email.trim()}>
            <UserPlus className="h-4 w-4" /> Agregar
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ingresa con magic link desde el login. <strong>Admin</strong> puede
          tomar/liberar conversaciones de otros agentes; <strong>Miembro</strong>{" "}
          solo las propias.
        </p>
      </div>

      {/* Listado */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="px-3 py-2">
                  {u.displayName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {u.email}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {u.role === "member" || u.role === "tenant_admin" ? (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        changeRole(u, e.target.value as TenantRole)
                      }
                      disabled={pending}
                      className="rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      <option value="member">Miembro</option>
                      <option value="tenant_admin">Admin</option>
                    </select>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(u)}
                    disabled={pending || u.userId === currentUserId}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Sin usuarios en este tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
