"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, CalendarDays, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AppointmentSettings,
  AvailabilityException,
  Professional,
  ProfessionalSchedule,
  Specialty,
  Treatment,
} from "@/lib/types";
import type { Tables } from "@/lib/database.types";
import {
  addException,
  addSchedule,
  deleteException,
  deleteProfessional,
  deleteSchedule,
  deleteSpecialty,
  deleteTreatment,
  disconnectGoogleCalendar,
  listGoogleCalendars,
  saveAppointmentSettings,
  setGcalSyncEnabled,
  setGoogleCalendarId,
  setProfessionalSpecialties,
  setProfessionalTreatments,
  upsertProfessional,
  upsertSpecialty,
  upsertTreatment,
  type ActionState,
} from "../actions";
import type { GcalCalendarOption } from "@/lib/appointments/gcal-client";

type ProfTreatment = Tables<"professional_treatments">;
type ProfSpecialty = Tables<"professional_specialties">;
type GcalConnection = Pick<
  Tables<"gcal_connections">,
  "google_account_email" | "calendar_id" | "status" | "last_sync_at"
>;

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const GCAL_ERROR_MSG: Record<string, string> = {
  estado_invalido: "La sesión de conexión venció o es inválida. Probá de nuevo.",
  no_autorizado: "No autorizado para conectar Google Calendar en esta empresa.",
  sin_refresh_token: "Google no devolvió permiso de acceso continuo. Reintentá la conexión.",
  fallo_conexion: "No se pudo completar la conexión con Google. Reintentá en un momento.",
  sin_tenant: "Entrá a una empresa antes de conectar Google Calendar.",
};

type Props = {
  tenantName: string;
  settings: AppointmentSettings | null;
  specialties: Specialty[];
  treatments: Treatment[];
  professionals: Professional[];
  profTreatments: ProfTreatment[];
  profSpecialties: ProfSpecialty[];
  schedules: ProfessionalSchedule[];
  exceptions: AvailabilityException[];
  gcalConnection: GcalConnection | null;
};

export function ConfigManager(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("gcal_connected");
    const err = searchParams.get("gcal_error");
    if (connected) {
      toast.success("Google Calendar conectado");
      router.replace("/agenda/config");
    } else if (err) {
      toast.error(GCAL_ERROR_MSG[err] ?? "No se pudo conectar con Google Calendar");
      router.replace("/agenda/config");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/agenda">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Agenda
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Configuración de turnos</h1>
      </div>

      <SettingsSection settings={props.settings} />
      <SpecialtiesSection specialties={props.specialties} />
      <TreatmentsSection treatments={props.treatments} specialties={props.specialties} />
      <ProfessionalsSection {...props} />
      <GcalSection connection={props.gcalConnection} syncEnabled={props.settings?.gcal_sync_enabled ?? false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Card({ title, children, desc }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
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

function num(props: { name: string; def: number }) {
  return <Input type="number" name={props.name} defaultValue={props.def} />;
}

// --- Settings ---
function SettingsSection({ settings }: { settings: AppointmentSettings | null }) {
  const [state, action] = useFormState<ActionState, FormData>(saveAppointmentSettings, {});
  if (state.error) toast.error(state.error);
  return (
    <Card title="General" desc="Parámetros predeterminados de la empresa (los tratamientos/profesionales pueden sobrescribir).">
      <form action={action} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} className="h-4 w-4" />
          Módulo de turnos habilitado
        </label>
        <div className="flex gap-2">
          <Field label="Zona horaria">
            <Input name="timezone" defaultValue={settings?.timezone ?? "America/Argentina/Buenos_Aires"} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Field label="Franja (min)">{num({ name: "slot_minutes", def: settings?.slot_minutes ?? 30 })}</Field>
          <Field label="Duración turno (min)">{num({ name: "appointment_minutes", def: settings?.appointment_minutes ?? 30 })}</Field>
          <Field label="Retención (min)">{num({ name: "hold_minutes", def: settings?.hold_minutes ?? 10 })}</Field>
        </div>
        <div className="flex gap-2">
          <Field label="Anticipación mínima (min)">{num({ name: "min_lead_minutes", def: settings?.min_lead_minutes ?? 120 })}</Field>
          <Field label="Máx. días a futuro">{num({ name: "max_advance_days", def: settings?.max_advance_days ?? 60 })}</Field>
        </div>
        <div className="space-y-2 rounded-md border p-3">
          <Check name="allow_choose_professional" label="El paciente puede elegir profesional" def={settings?.allow_choose_professional ?? true} />
          <Check name="auto_assign_professional" label="Asignar automáticamente cualquier profesional disponible" def={settings?.auto_assign_professional ?? false} />
          <Check name="allow_multiple_per_conversation" label="Permitir varios turnos por conversación" def={settings?.allow_multiple_per_conversation ?? false} />
        </div>
        <div className="flex gap-2">
          <Field label="Política de cancelación">
            <textarea name="cancellation_policy" defaultValue={settings?.cancellation_policy ?? ""} className="min-h-[50px] w-full rounded-md border bg-background p-2 text-sm" />
          </Field>
          <Field label="Política de reprogramación">
            <textarea name="reschedule_policy" defaultValue={settings?.reschedule_policy ?? ""} className="min-h-[50px] w-full rounded-md border bg-background p-2 text-sm" />
          </Field>
        </div>
        <div className="flex gap-2">
          <Field label="Plantilla de confirmación">
            <textarea name="msg_confirm_template" defaultValue={settings?.msg_confirm_template ?? ""} className="min-h-[50px] w-full rounded-md border bg-background p-2 text-sm" placeholder="Tu turno quedó confirmado para {fecha} con {profesional}." />
          </Field>
          <Field label="Plantilla de cancelación">
            <textarea name="msg_cancel_template" defaultValue={settings?.msg_cancel_template ?? ""} className="min-h-[50px] w-full rounded-md border bg-background p-2 text-sm" />
          </Field>
        </div>
        {/* gcal oculto acá; se maneja en su sección, pero enviamos el valor actual */}
        <input type="hidden" name="gcal_sync_enabled" value={settings?.gcal_sync_enabled ? "on" : ""} />
        <SubmitBtn okState={state.ok} />
      </form>
    </Card>
  );
}

function Check({ name, label, def }: { name: string; label: string; def: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={def} className="h-4 w-4" />
      {label}
    </label>
  );
}

function SubmitBtn({ okState }: { okState?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit">Guardar</Button>
      {okState && <span className="text-xs text-green-600">Guardado ✓</span>}
    </div>
  );
}

// --- Especialidades ---
function SpecialtiesSection({ specialties }: { specialties: Specialty[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function add() {
    if (!name.trim()) return;
    start(async () => {
      const r = await upsertSpecialty({ name, description: desc });
      if (r.error) { toast.error(r.error); return; }
      setName("");
      setDesc("");
      toast.success("Especialidad agregada");
      router.refresh();
    });
  }
  function toggle(s: Specialty) {
    start(async () => {
      const r = await upsertSpecialty({ id: s.id, name: s.name, description: s.description ?? "", active: !s.active });
      if (r.error) { toast.error(r.error); return; }
      router.refresh();
    });
  }
  function del(s: Specialty) {
    if (!confirm(`¿Eliminar "${s.name}"?`)) return;
    start(async () => {
      const r = await deleteSpecialty(s.id);
      if (r.error) { toast.error(r.error); return; }
      router.refresh();
    });
  }

  return (
    <Card title="Especialidades">
      <div className="mb-3 flex items-end gap-2">
        <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ortodoncia" /></Field>
        <Field label="Descripción"><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Button onClick={add} disabled={pending || !name.trim()}><Plus className="h-4 w-4" /> Agregar</Button>
      </div>
      <SimpleList
        rows={specialties.map((s) => ({
          id: s.id,
          main: s.name,
          sub: s.description ?? "",
          active: s.active,
          onToggle: () => toggle(s),
          onDelete: () => del(s),
        }))}
        pending={pending}
        empty="Sin especialidades."
      />
    </Card>
  );
}

// --- Tratamientos ---
function TreatmentsSection({ treatments, specialties }: { treatments: Treatment[]; specialties: Specialty[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [specialtyId, setSpecialtyId] = useState("");

  function add() {
    if (!name.trim()) return;
    start(async () => {
      const r = await upsertTreatment({ name, duration_minutes: duration, buffer_minutes: buffer, specialty_id: specialtyId || null });
      if (r.error) { toast.error(r.error); return; }
      setName("");
      setDuration(30);
      setBuffer(0);
      toast.success("Tratamiento agregado");
      router.refresh();
    });
  }
  function del(t: Treatment) {
    if (!confirm(`¿Eliminar "${t.name}"?`)) return;
    start(async () => {
      const r = await deleteTreatment(t.id);
      if (r.error) { toast.error(r.error); return; }
      router.refresh();
    });
  }
  function toggle(t: Treatment) {
    start(async () => {
      const r = await upsertTreatment({ id: t.id, name: t.name, duration_minutes: t.duration_minutes, buffer_minutes: t.buffer_minutes, specialty_id: t.specialty_id, active: !t.active });
      if (r.error) { toast.error(r.error); return; }
      router.refresh();
    });
  }
  const specName = (id: string | null) => specialties.find((s) => s.id === id)?.name ?? "—";

  return (
    <Card title="Tratamientos / servicios">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Limpieza dental" /></Field>
        <Field label="Especialidad">
          <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
            <option value="">—</option>
            {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Duración (min)"><Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
        <Field label="Buffer (min)"><Input type="number" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} /></Field>
        <Button onClick={add} disabled={pending || !name.trim()}><Plus className="h-4 w-4" /> Agregar</Button>
      </div>
      <SimpleList
        rows={treatments.map((t) => ({
          id: t.id,
          main: `${t.name} · ${t.duration_minutes} min${t.buffer_minutes ? ` (+${t.buffer_minutes})` : ""}`,
          sub: specName(t.specialty_id),
          active: t.active,
          onToggle: () => toggle(t),
          onDelete: () => del(t),
        }))}
        pending={pending}
        empty="Sin tratamientos."
      />
    </Card>
  );
}

// --- Profesionales ---
function ProfessionalsSection(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [maxPerSlot, setMaxPerSlot] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  function add() {
    if (!first.trim()) return;
    start(async () => {
      const r = await upsertProfessional({ first_name: first, last_name: last, max_per_slot: maxPerSlot });
      if (r.error) { toast.error(r.error); return; }
      setFirst("");
      setLast("");
      setMaxPerSlot(1);
      toast.success("Profesional agregado");
      router.refresh();
    });
  }
  function del(p: Professional) {
    if (!confirm(`¿Eliminar a ${p.first_name}? Se borran sus horarios y turnos.`)) return;
    start(async () => {
      const r = await deleteProfessional(p.id);
      if (r.error) { toast.error(r.error); return; }
      router.refresh();
    });
  }

  return (
    <Card title="Profesionales" desc="Un profesional es un recurso agendable; no necesita ser usuario del CRM.">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Nombre"><Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Ana" /></Field>
        <Field label="Apellido"><Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Pérez" /></Field>
        <Field label="Cupo por franja"><Input type="number" value={maxPerSlot} onChange={(e) => setMaxPerSlot(Number(e.target.value))} /></Field>
        <Button onClick={add} disabled={pending || !first.trim()}><Plus className="h-4 w-4" /> Agregar</Button>
      </div>

      <div className="space-y-2">
        {props.professionals.map((p) => (
          <div key={p.id} className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2">
              <button className="flex items-center gap-2 text-sm font-medium" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                {expanded === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {p.first_name} {p.last_name ?? ""}
                {!p.active && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                <span className="text-xs text-muted-foreground">· cupo {p.max_per_slot}</span>
              </button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del(p)} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {expanded === p.id && (
              <ProfessionalEditor
                professional={p}
                treatments={props.treatments}
                specialties={props.specialties}
                links={props.profTreatments.filter((l) => l.professional_id === p.id)}
                specLinks={props.profSpecialties.filter((l) => l.professional_id === p.id)}
                schedules={props.schedules.filter((s) => s.professional_id === p.id)}
                exceptions={props.exceptions.filter((e) => e.professional_id === p.id || e.professional_id === null)}
              />
            )}
          </div>
        ))}
        {props.professionals.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin profesionales.</p>}
      </div>
    </Card>
  );
}

function ProfessionalEditor({
  professional,
  treatments,
  specialties,
  links,
  specLinks,
  schedules,
  exceptions,
}: {
  professional: Professional;
  treatments: Treatment[];
  specialties: Specialty[];
  links: ProfTreatment[];
  specLinks: ProfSpecialty[];
  schedules: ProfessionalSchedule[];
  exceptions: AvailabilityException[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const linkedTreat = new Set(links.map((l) => l.treatment_id));
  const linkedSpec = new Set(specLinks.map((l) => l.specialty_id));

  // horario nuevo
  const [wd, setWd] = useState(1);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("13:00");
  // excepción nueva
  const [exDate, setExDate] = useState("");
  const [exType, setExType] = useState("block");
  const [exFrom, setExFrom] = useState("");
  const [exTo, setExTo] = useState("");

  const refresh = (p: Promise<ActionState>, msg: string) =>
    start(async () => {
      const r = await p;
      if (r.error) { toast.error(r.error); return; }
      if (msg) toast.success(msg);
      router.refresh();
    });

  function toggleTreat(id: string) {
    const next = new Set(linkedTreat);
    next.has(id) ? next.delete(id) : next.add(id);
    refresh(setProfessionalTreatments(professional.id, [...next]), "");
  }
  function toggleSpec(id: string) {
    const next = new Set(linkedSpec);
    next.has(id) ? next.delete(id) : next.add(id);
    refresh(setProfessionalSpecialties(professional.id, [...next]), "");
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 p-3 text-sm">
      {/* Especialidades */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Especialidades</p>
        <div className="flex flex-wrap gap-2">
          {specialties.map((s) => (
            <button key={s.id} onClick={() => toggleSpec(s.id)} disabled={pending}
              className={"rounded-full border px-2 py-0.5 text-xs " + (linkedSpec.has(s.id) ? "border-primary bg-primary text-primary-foreground" : "")}>
              {s.name}
            </button>
          ))}
          {specialties.length === 0 && <span className="text-xs text-muted-foreground">Creá especialidades primero.</span>}
        </div>
      </div>

      {/* Tratamientos habilitados */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Tratamientos que realiza</p>
        <div className="flex flex-wrap gap-2">
          {treatments.map((t) => (
            <button key={t.id} onClick={() => toggleTreat(t.id)} disabled={pending}
              className={"rounded-full border px-2 py-0.5 text-xs " + (linkedTreat.has(t.id) ? "border-primary bg-primary text-primary-foreground" : "")}>
              {t.name}
            </button>
          ))}
          {treatments.length === 0 && <span className="text-xs text-muted-foreground">Creá tratamientos primero.</span>}
        </div>
      </div>

      {/* Horarios habituales */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Horarios habituales</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {schedules.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs">
              {WEEKDAYS[s.weekday]} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              <button onClick={() => refresh(deleteSchedule(s.id), "Horario eliminado")} disabled={pending} className="text-destructive">×</button>
            </span>
          ))}
          {schedules.length === 0 && <span className="text-xs text-muted-foreground">Sin horarios.</span>}
        </div>
        <div className="flex items-end gap-2">
          <select value={wd} onChange={(e) => setWd(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-xs">
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" />
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => refresh(addSchedule({ professional_id: professional.id, weekday: wd, start_time: from, end_time: to }), "Horario agregado")}>
            Agregar
          </Button>
        </div>
      </div>

      {/* Excepciones */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Excepciones (bloqueos / feriados / aperturas)</p>
        <div className="mb-2 flex flex-col gap-1">
          {exceptions.map((e) => (
            <span key={e.id} className="flex items-center gap-2 rounded border bg-background px-2 py-0.5 text-xs">
              <strong>{e.date}</strong> {e.type}
              {e.start_time ? ` ${e.start_time.slice(0, 5)}–${e.end_time?.slice(0, 5)}` : " (día completo)"}
              {e.professional_id === null ? " · global" : ""}
              <button onClick={() => refresh(deleteException(e.id), "Excepción eliminada")} disabled={pending} className="ml-auto text-destructive">×</button>
            </span>
          ))}
          {exceptions.length === 0 && <span className="text-xs text-muted-foreground">Sin excepciones.</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" />
          <select value={exType} onChange={(e) => setExType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs">
            <option value="block">Bloqueo</option>
            <option value="holiday">Feriado</option>
            <option value="vacation">Vacaciones</option>
            <option value="leave">Licencia</option>
            <option value="open">Apertura extra</option>
          </select>
          <input type="time" value={exFrom} onChange={(e) => setExFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" placeholder="desde" />
          <input type="time" value={exTo} onChange={(e) => setExTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" placeholder="hasta" />
          <Button size="sm" variant="outline" disabled={pending || !exDate}
            onClick={() => refresh(addException({ professional_id: professional.id, date: exDate, type: exType, start_time: exFrom || null, end_time: exTo || null }), "Excepción agregada")}>
            Agregar
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Dejá las horas vacías para bloquear/abrir el día completo.</p>
      </div>
    </div>
  );
}

function GcalSection({
  connection,
  syncEnabled,
}: {
  connection: GcalConnection | null;
  syncEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const connected = connection?.status === "connected";
  const [calendars, setCalendars] = useState<GcalCalendarOption[] | null>(null);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  function toggleSync(next: boolean) {
    startTransition(async () => {
      const res = await setGcalSyncEnabled(next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Sincronización activada" : "Sincronización desactivada");
      router.refresh();
    });
  }

  function disconnect() {
    if (!confirm("¿Desconectar Google Calendar? Los turnos ya sincronizados no se borran de tu calendario.")) {
      return;
    }
    startTransition(async () => {
      const res = await disconnectGoogleCalendar();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Google Calendar desconectado");
      router.refresh();
    });
  }

  function loadCalendars() {
    setLoadingCalendars(true);
    startTransition(async () => {
      const res = await listGoogleCalendars();
      setLoadingCalendars(false);
      if (!res.ok) {
        toast.error("No se pudieron cargar los calendarios: " + res.error);
        return;
      }
      setCalendars(res.data);
    });
  }

  function chooseCalendar(calendarId: string) {
    startTransition(async () => {
      const res = await setGoogleCalendarId(calendarId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Calendario actualizado");
      setCalendars(null);
      router.refresh();
    });
  }

  return (
    <Card title="Google Calendar" desc="Sincroniza los turnos confirmados, cancelados y reprogramados con un calendario de Google.">
      {!connected ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {connection?.status === "error"
              ? "La conexión falló o el permiso fue revocado. Reconectá para seguir sincronizando."
              : "Sin conectar."}
          </div>
          <Button asChild size="sm">
            <a href="/api/integrations/google/authorize">Conectar con Google</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">{connection?.google_account_email ?? "Cuenta conectada"}</p>
              <p className="text-xs text-muted-foreground">
                Calendario: {connection?.calendar_id ?? "primary"}
                {connection?.last_sync_at ? ` · última sync: ${new Date(connection.last_sync_at).toLocaleString("es-AR")}` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
              <Unplug className="h-4 w-4" /> Desconectar
            </Button>
          </div>

          <div className="rounded-md border p-3">
            {calendars === null ? (
              <Button variant="outline" size="sm" onClick={loadCalendars} disabled={loadingCalendars}>
                {loadingCalendars ? "Buscando calendarios…" : "Cambiar calendario"}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Elegí en qué calendario se crean los turnos:
                </p>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  defaultValue={connection?.calendar_id ?? ""}
                  disabled={pending}
                  onChange={(e) => chooseCalendar(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccioná un calendario…
                  </option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                      {c.primary ? " (principal)" : ""}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" onClick={() => setCalendars(null)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={syncEnabled}
              disabled={pending}
              onChange={(e) => toggleSync(e.target.checked)}
              className="h-4 w-4"
            />
            Sincronizar turnos automáticamente (al confirmar, cancelar o reprogramar)
          </label>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function SimpleList({
  rows,
  pending,
  empty,
}: {
  rows: { id: string; main: string; sub: string; active: boolean; onToggle: () => void; onDelete: () => void }[];
  pending: boolean;
  empty: string;
}) {
  return (
    <div className="divide-y rounded-md border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            <p className={r.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>{r.main}</p>
            {r.sub && <p className="text-xs text-muted-foreground">{r.sub}</p>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={r.onToggle} disabled={pending} className="rounded border px-2 py-1 text-xs hover:bg-accent">
              {r.active ? "Desactivar" : "Activar"}
            </button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={r.onDelete} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}
