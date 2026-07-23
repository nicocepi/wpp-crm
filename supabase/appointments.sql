-- ============================================================================
-- WhatsApp CRM — MÓDULO DE AGENDAMIENTO DE TURNOS (appointments)
-- Correr en Supabase -> SQL Editor DESPUÉS de impersonation-rls.sql
-- (es el paso #16 del orden canónico; ver supabase/MIGRATIONS.md).
--
-- Diseño (Alternativa C): el CRM es la fuente de verdad. Google Calendar es
-- sincronización externa DIFERIDA (Fase 2): acá solo se crean las tablas de
-- scaffolding (gcal_connections / gcal_sync_outbox) y los campos de sync en
-- appointments; no se guardan tokens reales ni se sincroniza nada todavía.
--
-- Aislamiento: mismo patrón que el resto del esquema — RLS por tenant con
--   `tenant_id = current_tenant_id() or (is_admin() and not is_impersonating())`.
-- Todo es idempotente (create ... if not exists / drop policy if exists).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- appointment_settings (config del módulo por tenant; 1:1 como bot_configs)
-- El feature flag `enabled` gobierna todo: si es false, el tenant funciona
-- exactamente como antes (nada de turnos ni en el panel ni en WhatsApp).
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,                        -- feature flag por empresa
  timezone text not null default 'America/Argentina/Buenos_Aires',
  slot_minutes int not null default 30,                          -- duración de franja default
  appointment_minutes int not null default 30,                  -- duración de turno default
  min_lead_minutes int not null default 120,                    -- anticipación mínima para reservar
  max_advance_days int not null default 60,                     -- máximo de días futuros reservables
  hold_minutes int not null default 10,                         -- vida de la retención provisoria
  allow_choose_professional boolean not null default true,      -- el paciente puede elegir profesional
  auto_assign_professional boolean not null default false,      -- asignar automáticamente cualquiera disponible
  allow_multiple_per_conversation boolean not null default false,
  gcal_sync_enabled boolean not null default false,             -- sync con Google Calendar (Fase 2; off)
  cancellation_policy text,
  reschedule_policy text,
  msg_confirm_template text,                                    -- plantilla de confirmación (opcional)
  msg_cancel_template text,                                     -- plantilla de cancelación (opcional)
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- specialties (especialidades: odontología general, ortodoncia, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- treatments (tratamientos / servicios). La duración sobrescribe la default
-- de la empresa. buffer_minutes = tiempo extra de preparación/limpieza.
-- ---------------------------------------------------------------------------
create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  specialty_id uuid references public.specialties(id) on delete set null,
  name text not null,
  description text,
  duration_minutes int not null default 30,
  buffer_minutes int not null default 0,
  price numeric(12,2),                     -- informativo, opcional
  requirements text,                       -- indicaciones previas
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- professionals (recurso agendable; NO necesariamente un user del CRM)
-- ---------------------------------------------------------------------------
create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  first_name text not null,
  last_name text,
  external_ref text,                       -- identificador interno del negocio
  active boolean not null default true,
  slot_minutes int,                        -- override de franja (null = usa el de la empresa)
  max_per_slot int not null default 1,     -- cupo por franja (turnos solapados permitidos)
  color text,                              -- referencia visual para la agenda
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- professional_specialties (N:N)
-- ---------------------------------------------------------------------------
create table if not exists public.professional_specialties (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  primary key (professional_id, specialty_id)
);

-- ---------------------------------------------------------------------------
-- professional_treatments (N:N + overrides del nivel más específico de la
-- jerarquía de configuración: profesional+tratamiento).
-- ---------------------------------------------------------------------------
create table if not exists public.professional_treatments (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  duration_minutes int,                    -- override de duración (null = usa la del tratamiento)
  slot_minutes int,                        -- override de franja
  max_per_slot int,                        -- override de cupo
  primary key (professional_id, treatment_id)
);

-- ---------------------------------------------------------------------------
-- professional_schedules (horarios habituales; varias filas por día = rangos
-- partidos, ej. 09-13 y 15-19 el mismo lunes). weekday: 0=domingo ... 6=sábado.
-- ---------------------------------------------------------------------------
create table if not exists public.professional_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz default now(),
  check (end_time > start_time)
);

-- ---------------------------------------------------------------------------
-- availability_exceptions (vacaciones, licencias, feriados, bloqueos y
-- aperturas puntuales). professional_id null = aplica a todo el tenant (feriado).
-- Bloqueo total del día: start_time/end_time null. Parcial: rango seteado.
-- type='open' = disponibilidad adicional en un día puntual.
-- ---------------------------------------------------------------------------
create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  type text not null default 'block'
    check (type in ('block','open','holiday','vacation','leave')),
  reason text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- appointments (turnos). Estados: held (retención provisoria), pending,
-- confirmed, cancelled, completed, no_show, rescheduled.
-- Consumen cupo: held (no vencido) + pending + confirmed.
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text,
  specialty_id uuid references public.specialties(id) on delete set null,
  treatment_id uuid references public.treatments(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes int not null,
  status text not null default 'held'
    check (status in ('held','pending','confirmed','cancelled','completed','no_show','rescheduled')),
  origin text not null default 'whatsapp'
    check (origin in ('whatsapp','admin','scheduled','sync')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,  -- user si fue manual
  hold_expires_at timestamptz,                                   -- vence la retención
  idempotency_key text,                                          -- dedupe de creación
  gcal_event_id text,                                            -- Fase 2
  gcal_calendar_id text,                                         -- Fase 2
  sync_status text not null default 'disabled'
    check (sync_status in ('disabled','pending','synced','failed')),
  sync_error text,
  synced_at timestamptz,
  rescheduled_from uuid references public.appointments(id) on delete set null,  -- trazabilidad
  correlation_id uuid,                                           -- trazabilidad punta a punta
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_at > start_at)
);

-- Idempotencia real: una key no puede duplicar turno dentro del tenant.
create unique index if not exists uq_appointments_idempotency
  on public.appointments (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- appointment_audit (auditoría de dominio: quién hizo qué). A diferencia de
-- event_logs (que solo escribe n8n con service-role), acá también escribe el
-- CRM autenticado, por eso tiene policy de INSERT por tenant.
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_source text not null default 'admin'
    check (actor_source in ('whatsapp','admin','scheduled','sync')),
  action text not null,                    -- created|confirmed|cancelled|rescheduled|status_changed|...
  old_values jsonb,
  new_values jsonb,
  correlation_id uuid,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Scaffolding Google Calendar (Fase 2; NO usado en Fase 1)
-- Los tokens van cifrados en Fase 2 (pgsodium/Vault). En Fase 1 no se guardan.
-- ---------------------------------------------------------------------------
create table if not exists public.gcal_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,  -- null = a nivel empresa
  google_account_email text,
  access_token_encrypted text,             -- Fase 2: cifrado; nunca en texto plano
  refresh_token_encrypted text,            -- Fase 2: cifrado
  token_expires_at timestamptz,
  scopes text,
  calendar_id text,
  status text not null default 'disconnected'
    check (status in ('connected','disconnected','error')),
  last_sync_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.gcal_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  operation text not null check (operation in ('create','update','delete')),
  payload jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','synced','failed')),
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz default now(),
  correlation_id uuid,
  created_at timestamptz default now()
);

-- Fase 2 (implementada): conexión de Google Calendar por EMPRESA (no por
-- profesional todavía) — professional_id siempre null en esta fase. Único
-- (no parcial, a diferencia de otros índices) porque el upsert de PostgREST
-- necesita un unique constraint pleno para targetear con onConflict.
create unique index if not exists uq_gcal_connections_tenant
  on public.gcal_connections (tenant_id);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index if not exists idx_appt_tenant_prof_start on public.appointments (tenant_id, professional_id, start_at);
create index if not exists idx_appt_tenant_status_start on public.appointments (tenant_id, status, start_at);
create index if not exists idx_appt_contact_start on public.appointments (contact_id, start_at);
create index if not exists idx_appt_hold_expires on public.appointments (hold_expires_at) where status = 'held';
create index if not exists idx_appt_audit_appt on public.appointment_audit (appointment_id, created_at desc);
create index if not exists idx_appt_audit_tenant on public.appointment_audit (tenant_id, created_at desc);
create index if not exists idx_specialties_tenant on public.specialties (tenant_id);
create index if not exists idx_treatments_tenant on public.treatments (tenant_id);
create index if not exists idx_professionals_tenant on public.professionals (tenant_id);
create index if not exists idx_prof_schedules_prof on public.professional_schedules (professional_id, weekday);
create index if not exists idx_availability_exc_lookup on public.availability_exceptions (tenant_id, date);
create index if not exists idx_gcal_outbox_status on public.gcal_sync_outbox (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Trigger updated_at en appointments (única tabla con updated_at; justificado
-- por el ciclo de vida del turno: held->confirmed->cancelled/completed...).
-- ---------------------------------------------------------------------------
create or replace function public.appointments_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.appointments_set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.appointment_settings       enable row level security;
alter table public.specialties                 enable row level security;
alter table public.treatments                  enable row level security;
alter table public.professionals               enable row level security;
alter table public.professional_specialties    enable row level security;
alter table public.professional_treatments     enable row level security;
alter table public.professional_schedules      enable row level security;
alter table public.availability_exceptions     enable row level security;
alter table public.appointments                enable row level security;
alter table public.appointment_audit           enable row level security;
alter table public.gcal_connections            enable row level security;
alter table public.gcal_sync_outbox            enable row level security;

-- Helper local: predicado de pertenencia estándar (mismo que el resto del esquema).
-- (no se puede parametrizar una policy, así que se repite el patrón por tabla)

-- appointment_settings
drop policy if exists "tenant_isolation_appt_settings" on public.appointment_settings;
create policy "tenant_isolation_appt_settings" on public.appointment_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- specialties
drop policy if exists "tenant_isolation_specialties" on public.specialties;
create policy "tenant_isolation_specialties" on public.specialties
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- treatments
drop policy if exists "tenant_isolation_treatments" on public.treatments;
create policy "tenant_isolation_treatments" on public.treatments
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- professionals
drop policy if exists "tenant_isolation_professionals" on public.professionals;
create policy "tenant_isolation_professionals" on public.professionals
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- professional_specialties (via el profesional)
drop policy if exists "tenant_isolation_prof_specialties" on public.professional_specialties;
create policy "tenant_isolation_prof_specialties" on public.professional_specialties
  for all to authenticated
  using (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.tenant_id = public.current_tenant_id()
    )
  );

-- professional_treatments (via el profesional)
drop policy if exists "tenant_isolation_prof_treatments" on public.professional_treatments;
create policy "tenant_isolation_prof_treatments" on public.professional_treatments
  for all to authenticated
  using (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.tenant_id = public.current_tenant_id()
    )
  );

-- professional_schedules
drop policy if exists "tenant_isolation_prof_schedules" on public.professional_schedules;
create policy "tenant_isolation_prof_schedules" on public.professional_schedules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- availability_exceptions
drop policy if exists "tenant_isolation_availability_exc" on public.availability_exceptions;
create policy "tenant_isolation_availability_exc" on public.availability_exceptions
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- appointments
drop policy if exists "tenant_isolation_appointments" on public.appointments;
create policy "tenant_isolation_appointments" on public.appointments
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- appointment_audit (select + insert por tenant)
drop policy if exists "tenant_isolation_appt_audit" on public.appointment_audit;
create policy "tenant_isolation_appt_audit" on public.appointment_audit
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- gcal_connections (tokens: nunca se exponen al frontend; se leen solo server-side)
drop policy if exists "tenant_isolation_gcal_connections" on public.gcal_connections;
create policy "tenant_isolation_gcal_connections" on public.gcal_connections
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- gcal_sync_outbox
drop policy if exists "tenant_isolation_gcal_outbox" on public.gcal_sync_outbox;
create policy "tenant_isolation_gcal_outbox" on public.gcal_sync_outbox
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- ============================================================================
-- Reserva atómica anti-doble-turno
-- ============================================================================

-- ---------------------------------------------------------------------------
-- appt_resolve_max_per_slot: jerarquía profesional+tratamiento > profesional.
-- (el tratamiento y la empresa no definen cupo en este modelo; el cupo es del
--  recurso profesional). Devuelve >= 1.
-- ---------------------------------------------------------------------------
create or replace function public.appt_resolve_max_per_slot(
  p_professional_id uuid,
  p_treatment_id uuid
) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pt.max_per_slot from public.professional_treatments pt
      where pt.professional_id = p_professional_id
        and pt.treatment_id = p_treatment_id
        and pt.max_per_slot is not null),
    (select p.max_per_slot from public.professionals p where p.id = p_professional_id),
    1
  );
$$;

-- ---------------------------------------------------------------------------
-- book_appointment: crea un turno (held o confirmed) de forma atómica.
--   1) idempotencia por idempotency_key (devuelve el turno existente).
--   2) advisory lock por (profesional, inicio) para serializar la franja.
--   3) cuenta turnos SOLAPADOS que consumen cupo (held no vencido + pending +
--      confirmed) y compara contra el cupo resuelto -> si no entra: 'slot_full'.
--   4) inserta y audita.
-- Seguridad: un usuario 'authenticated' solo puede reservar en su propio tenant
-- (o el impersonado). service_role (n8n) pasa el tenant explícito y validado.
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_treatment_id uuid,
  p_specialty_id uuid,
  p_start_at timestamptz,
  p_duration_minutes int,
  p_status text default 'held',
  p_contact_id uuid default null,
  p_phone text default null,
  p_origin text default 'whatsapp',
  p_hold_minutes int default 10,
  p_idempotency_key text default null,
  p_correlation_id uuid default null,
  p_created_by uuid default null,
  p_notes text default null
) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'authenticated');
  v_end_at timestamptz := p_start_at + make_interval(mins => p_duration_minutes);
  v_max int;
  v_occupied int;
  v_hold_expires timestamptz;
  v_row public.appointments;
begin
  if p_status not in ('held','pending','confirmed') then
    raise exception 'invalid_status';
  end if;

  -- Gate de tenant para el path autenticado (service_role queda exento: es n8n).
  if v_jwt_role <> 'service_role' and p_tenant_id <> public.current_tenant_id() then
    raise exception 'tenant_mismatch';
  end if;

  -- Idempotencia: misma key => mismo turno.
  if p_idempotency_key is not null then
    select * into v_row from public.appointments
      where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key
      limit 1;
    if found then
      return v_row;
    end if;
  end if;

  -- El profesional debe existir, pertenecer al tenant y estar activo.
  if not exists (
    select 1 from public.professionals p
    where p.id = p_professional_id and p.tenant_id = p_tenant_id and p.active
  ) then
    raise exception 'invalid_professional';
  end if;

  -- Serializar la franja (por profesional + inicio) para todas las tx concurrentes.
  perform pg_advisory_xact_lock(
    hashtextextended(p_professional_id::text || '|' || p_start_at::text, 0)
  );

  v_max := public.appt_resolve_max_per_slot(p_professional_id, p_treatment_id);

  -- Cupos ocupados = turnos activos del profesional que SE SOLAPAN con [start,end).
  -- Los cancelados/vencidos/reprogramados/no_show/completed no cuentan.
  select count(*) into v_occupied
  from public.appointments a
  where a.tenant_id = p_tenant_id
    and a.professional_id = p_professional_id
    and a.status in ('held','pending','confirmed')
    and (a.status <> 'held' or a.hold_expires_at > now())   -- holds vencidos no cuentan (lazy)
    and a.start_at < v_end_at
    and a.end_at > p_start_at;

  if v_occupied >= v_max then
    raise exception 'slot_full';
  end if;

  if p_status = 'held' then
    v_hold_expires := now() + make_interval(mins => greatest(p_hold_minutes, 1));
  end if;

  insert into public.appointments (
    tenant_id, contact_id, phone, specialty_id, treatment_id, professional_id,
    start_at, end_at, duration_minutes, status, origin, hold_expires_at,
    idempotency_key, correlation_id, created_by, notes
  ) values (
    p_tenant_id, p_contact_id, p_phone, p_specialty_id, p_treatment_id, p_professional_id,
    p_start_at, v_end_at, p_duration_minutes, p_status, p_origin, v_hold_expires,
    p_idempotency_key, p_correlation_id, p_created_by, p_notes
  ) returning * into v_row;

  insert into public.appointment_audit (tenant_id, appointment_id, actor_user_id, actor_source, action, new_values, correlation_id)
  values (
    p_tenant_id, v_row.id, p_created_by,
    case when v_jwt_role = 'service_role' then 'whatsapp' else 'admin' end,
    case when p_status = 'held' then 'held' else 'created' end,
    to_jsonb(v_row), p_correlation_id
  );

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- confirm_held_appointment: transiciona held/pending -> confirmed si la
-- retención no venció. El cupo ya estaba tomado por el hold, así que solo
-- revalida vencimiento y flipea el estado.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_held_appointment(
  p_appointment_id uuid,
  p_tenant_id uuid,
  p_correlation_id uuid default null,
  p_created_by uuid default null
) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'authenticated');
  v_old public.appointments;
  v_row public.appointments;
begin
  if v_jwt_role <> 'service_role' and p_tenant_id <> public.current_tenant_id() then
    raise exception 'tenant_mismatch';
  end if;

  select * into v_old from public.appointments
    where id = p_appointment_id and tenant_id = p_tenant_id
    for update;
  if not found then
    raise exception 'appointment_not_found';
  end if;

  if v_old.status = 'confirmed' then
    return v_old;   -- idempotente
  end if;
  if v_old.status not in ('held','pending') then
    raise exception 'invalid_status';
  end if;
  if v_old.status = 'held' and v_old.hold_expires_at is not null and v_old.hold_expires_at <= now() then
    raise exception 'hold_expired';
  end if;

  update public.appointments
    set status = 'confirmed', hold_expires_at = null
    where id = p_appointment_id
    returning * into v_row;

  insert into public.appointment_audit (tenant_id, appointment_id, actor_user_id, actor_source, action, old_values, new_values, correlation_id)
  values (
    p_tenant_id, v_row.id, p_created_by,
    case when v_jwt_role = 'service_role' then 'whatsapp' else 'admin' end,
    'confirmed', to_jsonb(v_old), to_jsonb(v_row), p_correlation_id
  );

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- reopen_appointment: transiciona un turno a 'pending'/'confirmed' RE-VALIDANDO
-- cupo en la misma transacción (excluyéndose a sí mismo del conteo). Necesaria
-- para cualquier cambio de estado manual (panel admin) que vuelva a un estado
-- que consume cupo (ej. "Reabrir" un turno completed/no_show a confirmed):
-- mientras el turno estuvo completed/no_show/cancelled no consumía cupo, así
-- que otro turno pudo haber ocupado esa franja en el medio. Un update directo
-- de status (sin este chequeo) permitiría sobre-ocupar la franja.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_appointment(
  p_tenant_id uuid,
  p_appointment_id uuid,
  p_status text default 'confirmed',
  p_correlation_id uuid default null,
  p_created_by uuid default null
) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'authenticated');
  v_old public.appointments;
  v_row public.appointments;
  v_max int;
  v_occupied int;
begin
  if p_status not in ('pending','confirmed') then
    raise exception 'invalid_status';
  end if;
  if v_jwt_role <> 'service_role' and p_tenant_id <> public.current_tenant_id() then
    raise exception 'tenant_mismatch';
  end if;

  select * into v_old from public.appointments
    where id = p_appointment_id and tenant_id = p_tenant_id
    for update;
  if not found then
    raise exception 'appointment_not_found';
  end if;
  if v_old.professional_id is null then
    raise exception 'invalid_professional';
  end if;

  -- Mismo lock que book_appointment: serializa contra creaciones/reaperturas
  -- concurrentes en la misma franja del profesional.
  perform pg_advisory_xact_lock(
    hashtextextended(v_old.professional_id::text || '|' || v_old.start_at::text, 0)
  );

  v_max := public.appt_resolve_max_per_slot(v_old.professional_id, v_old.treatment_id);

  select count(*) into v_occupied
  from public.appointments a
  where a.tenant_id = p_tenant_id
    and a.professional_id = v_old.professional_id
    and a.id <> p_appointment_id
    and a.status in ('held','pending','confirmed')
    and (a.status <> 'held' or a.hold_expires_at > now())
    and a.start_at < v_old.end_at
    and a.end_at > v_old.start_at;

  if v_occupied >= v_max then
    raise exception 'slot_full';
  end if;

  update public.appointments
    set status = p_status, hold_expires_at = null
    where id = p_appointment_id
    returning * into v_row;

  insert into public.appointment_audit (tenant_id, appointment_id, actor_user_id, actor_source, action, old_values, new_values, correlation_id)
  values (
    p_tenant_id, v_row.id, p_created_by,
    case when v_jwt_role = 'service_role' then 'whatsapp' else 'admin' end,
    'reopened', to_jsonb(v_old), to_jsonb(v_row), p_correlation_id
  );

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- expire_appointment_holds: housekeeping de retenciones vencidas. Las consultas
-- ya ignoran holds vencidos (lazy), así que esto solo limpia. Devuelve la
-- cantidad expirada. Opcionalmente se agenda con pg_cron (ver abajo).
-- ---------------------------------------------------------------------------
create or replace function public.expire_appointment_holds()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  with expired as (
    update public.appointments
      set status = 'cancelled', notes = coalesce(notes,'') || ' [hold vencido]'
      where status = 'held' and hold_expires_at is not null and hold_expires_at <= now()
      returning id, tenant_id, correlation_id
  ), audited as (
    insert into public.appointment_audit (tenant_id, appointment_id, actor_source, action, correlation_id)
    select tenant_id, id, 'scheduled', 'hold_expired', correlation_id from expired
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;

-- Permisos de ejecución (authenticated = panel; service_role = n8n).
grant execute on function public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,int,text,uuid,text,text,int,text,uuid,uuid,text) to authenticated, service_role;
grant execute on function public.confirm_held_appointment(uuid,uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.reopen_appointment(uuid,uuid,text,uuid,uuid) to authenticated, service_role;
grant execute on function public.appt_resolve_max_per_slot(uuid,uuid) to authenticated, service_role;
grant execute on function public.expire_appointment_holds() to service_role;

-- ---------------------------------------------------------------------------
-- Realtime para la agenda (respeta RLS por sesión). Idempotente vía guard.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- OPCIONAL — limpieza programada de holds con pg_cron (no obligatorio; las
-- consultas ya son lazy). Descomentar si el proyecto habilita pg_cron:
--
--   create extension if not exists pg_cron;
--   select cron.schedule('expire-appointment-holds', '*/5 * * * *',
--     $$ select public.expire_appointment_holds(); $$);
-- ---------------------------------------------------------------------------
