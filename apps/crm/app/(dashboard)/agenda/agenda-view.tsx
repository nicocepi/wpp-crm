"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  APPOINTMENT_STATUS_META,
  SYNC_STATUS_META,
  addDaysYmd,
  dayLabel,
  timeInTZ,
} from "@/lib/format";
import type {
  Appointment,
  Professional,
  Specialty,
  Treatment,
  AppointmentStatus,
} from "@/lib/types";
import {
  cancelAppointmentAction,
  createManualAppointment,
  rescheduleAppointmentAction,
  setAppointmentStatus,
  updateAppointmentNotes,
  retrySync,
} from "./actions";

type Props = {
  tenantName: string;
  timezone: string;
  day: string;
  filterProfessional: string;
  filterStatus: string;
  appointments: Appointment[];
  professionals: Professional[];
  treatments: Treatment[];
  specialties: Specialty[];
};

function profName(p: Professional) {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`;
}

export function AgendaView(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const profById = useMemo(
    () => new Map(props.professionals.map((p) => [p.id, p])),
    [props.professionals],
  );
  const treatById = useMemo(
    () => new Map(props.treatments.map((t) => [t.id, t])),
    [props.treatments],
  );

  function pushParams(next: Partial<{ date: string; professional: string; status: string }>) {
    const params = new URLSearchParams();
    const date = next.date ?? props.day;
    const professional = next.professional ?? props.filterProfessional;
    const status = next.status ?? props.filterStatus;
    if (date) params.set("date", date);
    if (professional) params.set("professional", professional);
    if (status) params.set("status", status);
    router.push(`/agenda?${params.toString()}`);
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(mapError(res.error));
        return;
      }
      toast.success(okMsg);
      setEditing(null);
      setNewOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5" /> Agenda
          </h1>
          <p className="text-sm text-muted-foreground">{props.tenantName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/agenda/config">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" /> Configuración
            </Button>
          </Link>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo turno
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
        <Button variant="ghost" size="sm" onClick={() => pushParams({ date: addDaysYmd(props.day, -1) })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={props.day}
          onChange={(e) => pushParams({ date: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
        <Button variant="ghost" size="sm" onClick={() => pushParams({ date: addDaysYmd(props.day, 1) })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-1 text-sm font-medium capitalize">{dayLabel(props.day)}</span>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={props.filterProfessional}
            onChange={(e) => pushParams({ professional: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos los profesionales</option>
            {props.professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {profName(p)}
              </option>
            ))}
          </select>
          <select
            value={props.filterStatus}
            onChange={(e) => pushParams({ status: e.target.value })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {Object.entries(APPOINTMENT_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Hora</th>
              <th className="px-3 py-2 font-medium">Profesional</th>
              <th className="px-3 py-2 font-medium">Tratamiento</th>
              <th className="px-3 py-2 font-medium">Paciente</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Sync</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {props.appointments.map((a) => {
              const meta = APPOINTMENT_STATUS_META[a.status] ?? { label: a.status, className: "" };
              const sync = SYNC_STATUS_META[a.sync_status] ?? { label: a.sync_status, className: "" };
              const prof = a.professional_id ? profById.get(a.professional_id) : null;
              const treat = a.treatment_id ? treatById.get(a.treatment_id) : null;
              return (
                <tr key={a.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {timeInTZ(a.start_at, props.timezone)}–{timeInTZ(a.end_at, props.timezone)}
                  </td>
                  <td className="px-3 py-2">{prof ? profName(prof) : "—"}</td>
                  <td className="px-3 py-2">{treat?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {a.phone ?? <span className="text-muted-foreground">—</span>}
                    {a.notes ? (
                      <p className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground">{a.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={"inline-block rounded-full border px-2 py-0.5 text-xs " + meta.className}>
                      {meta.label}
                    </span>
                  </td>
                  <td className={"px-3 py-2 text-xs " + sync.className}>{sync.label}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {(a.status === "held" || a.status === "pending") && (
                        <ActionBtn label="Confirmar" onClick={() => run(() => setAppointmentStatus(a.id, "confirmed"), "Confirmado")} disabled={pending} />
                      )}
                      {a.status === "confirmed" && (
                        <>
                          <ActionBtn label="Atendido" onClick={() => run(() => setAppointmentStatus(a.id, "completed"), "Marcado atendido")} disabled={pending} />
                          <ActionBtn label="Ausente" onClick={() => run(() => setAppointmentStatus(a.id, "no_show"), "Marcado ausente")} disabled={pending} />
                        </>
                      )}
                      {a.status === "completed" && (
                        <>
                          <ActionBtn label="Ausente" onClick={() => run(() => setAppointmentStatus(a.id, "no_show"), "Marcado ausente")} disabled={pending} />
                          <ActionBtn label="Reabrir" onClick={() => run(() => setAppointmentStatus(a.id, "confirmed"), "Vuelto a confirmado")} disabled={pending} />
                        </>
                      )}
                      {a.status === "no_show" && (
                        <>
                          <ActionBtn label="Atendido" onClick={() => run(() => setAppointmentStatus(a.id, "completed"), "Marcado atendido")} disabled={pending} />
                          <ActionBtn label="Reabrir" onClick={() => run(() => setAppointmentStatus(a.id, "confirmed"), "Vuelto a confirmado")} disabled={pending} />
                        </>
                      )}
                      {["held", "pending", "confirmed"].includes(a.status) && (
                        <>
                          <ActionBtn label="Reprogramar" onClick={() => setEditing(a)} disabled={pending} />
                          <ActionBtn
                            label="Cancelar"
                            danger
                            onClick={() => {
                              if (confirm("¿Cancelar este turno? El cupo vuelve a quedar disponible.")) {
                                run(() => cancelAppointmentAction(a.id), "Turno cancelado");
                              }
                            }}
                            disabled={pending}
                          />
                        </>
                      )}
                      {a.sync_status === "failed" && (
                        <ActionBtn label="Reintentar sync" onClick={() => run(() => retrySync(a.id), "Reintento encolado")} disabled={pending} />
                      )}
                      <ActionBtn label="Notas" onClick={() => setEditing(a)} disabled={pending} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {props.appointments.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  No hay turnos para este día con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sheet: nuevo turno */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nuevo turno</SheetTitle>
            <SheetDescription>
              Alta manual. Valida cupo y disponibilidad igual que WhatsApp.
            </SheetDescription>
          </SheetHeader>
          <NewAppointmentForm
            {...props}
            defaultDate={props.day}
            disabled={pending}
            onSubmit={(input) => run(() => createManualAppointment(input), "Turno creado")}
          />
        </SheetContent>
      </Sheet>

      {/* Sheet: editar (reprogramar / notas) */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          {editing && (
            <EditAppointment
              appointment={editing}
              professionals={props.professionals}
              timezone={props.timezone}
              disabled={pending}
              onReschedule={(date, time, professional_id) =>
                run(() => rescheduleAppointmentAction({ id: editing.id, date, time, professional_id }), "Turno reprogramado")
              }
              onSaveNotes={(notes) => run(() => updateAppointmentNotes(editing.id, notes), "Notas guardadas")}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50 " +
        (danger ? "border-red-200 text-red-600 hover:bg-red-50" : "")
      }
    >
      {label}
    </button>
  );
}

function NewAppointmentForm(
  props: Props & {
    defaultDate: string;
    disabled: boolean;
    onSubmit: (input: {
      professional_id: string;
      treatment_id: string;
      specialty_id?: string | null;
      date: string;
      time: string;
      phone?: string;
      notes?: string;
    }) => void;
  },
) {
  const [treatmentId, setTreatmentId] = useState(props.treatments[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(props.professionals[0]?.id ?? "");
  const [date, setDate] = useState(props.defaultDate);
  const [time, setTime] = useState("09:00");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const treatment = props.treatments.find((t) => t.id === treatmentId);

  return (
    <div className="mt-4 space-y-3 overflow-auto">
      <Field label="Tratamiento">
        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)}>
          {props.treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.duration_minutes} min)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Profesional">
        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
          {props.professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {profName(p)}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Field label="Fecha">
          <input type="date" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <input type="time" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Teléfono del paciente (opcional)">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="549..." />
      </Field>
      <Field label="Notas (opcional)">
        <textarea className="min-h-[70px] w-full rounded-md border bg-background p-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button
        className="w-full"
        disabled={props.disabled || !treatmentId || !professionalId}
        onClick={() =>
          props.onSubmit({
            professional_id: professionalId,
            treatment_id: treatmentId,
            specialty_id: treatment?.specialty_id ?? null,
            date,
            time,
            phone: phone.trim() || undefined,
            notes: notes.trim() || undefined,
          })
        }
      >
        Crear turno
      </Button>
    </div>
  );
}

function EditAppointment({
  appointment,
  professionals,
  timezone,
  disabled,
  onReschedule,
  onSaveNotes,
}: {
  appointment: Appointment;
  professionals: Professional[];
  timezone: string;
  disabled: boolean;
  onReschedule: (date: string, time: string, professionalId: string) => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [date, setDate] = useState(appointment.start_at.slice(0, 10));
  const [time, setTime] = useState(timeInTZ(appointment.start_at, timezone));
  const [professionalId, setProfessionalId] = useState(appointment.professional_id ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");

  return (
    <div className="mt-4 space-y-6 overflow-auto">
      <div>
        <SheetHeader>
          <SheetTitle>Reprogramar</SheetTitle>
          <SheetDescription>Crea un turno nuevo y conserva la trazabilidad del anterior.</SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-3">
          <Field label="Profesional">
            <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {profName(p)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <Field label="Nueva fecha">
              <input type="date" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Nueva hora">
              <input type="time" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Button className="w-full" disabled={disabled} onClick={() => onReschedule(date, time, professionalId)}>
            Reprogramar
          </Button>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="mb-2 text-sm font-medium">Notas</p>
        <textarea className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="outline" className="mt-2 w-full" disabled={disabled} onClick={() => onSaveNotes(notes)}>
          Guardar notas
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1 space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const ERROR_MSG: Record<string, string> = {
  slot_full: "Ese horario ya no tiene cupo disponible.",
  hold_expired: "La retención venció. Elegí el horario de nuevo.",
  invalid_treatment: "Tratamiento inválido.",
  invalid_professional: "El profesional no está disponible.",
  same_slot: "El nuevo horario es igual al actual.",
  module_disabled: "El módulo de turnos está deshabilitado.",
  tenant_mismatch: "Operación no permitida.",
};
function mapError(e: string): string {
  return ERROR_MSG[e] ?? e;
}
