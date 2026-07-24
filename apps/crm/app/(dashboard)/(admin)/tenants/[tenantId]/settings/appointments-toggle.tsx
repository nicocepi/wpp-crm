"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { setAppointmentsEnabled } from "./appointments-actions";

export function AppointmentsToggle({
  tenantId,
  enabled,
}: {
  tenantId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const res = await setAppointmentsEnabled(tenantId, next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Módulo de turnos habilitado" : "Módulo de turnos deshabilitado");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Módulo de turnos</p>
          <p className="text-xs text-muted-foreground">
            Permite agendar, cancelar y reprogramar turnos desde WhatsApp y el panel.
            La configuración detallada (especialidades, profesionales, horarios) se
            hace desde el tenant impersonado, en Turnos → Configuración.
          </p>
        </div>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4"
        />
        {enabled ? "Habilitado" : "Deshabilitado"}
      </label>
    </div>
  );
}
