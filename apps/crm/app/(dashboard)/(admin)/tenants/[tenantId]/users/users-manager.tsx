"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTenantUser, deleteTenantUser } from "./actions";

export type TenantUser = {
  userId: string;
  email: string;
  role: string;
  createdAt: string | null;
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
  const [pending, startTransition] = useTransition();

  function add() {
    const value = email.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await createTenantUser(tenantId, value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Usuario agregado");
      setEmail("");
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
          <Button onClick={add} disabled={pending || !email.trim()}>
            <UserPlus className="h-4 w-4" /> Agregar
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Se crea como <strong>member</strong> del tenant. Ingresa con magic link
          desde el login.
        </p>
      </div>

      {/* Listado */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {u.email}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {u.role}
                  </span>
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
                  colSpan={3}
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
