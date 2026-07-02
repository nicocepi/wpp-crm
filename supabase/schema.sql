-- ============================================================================
-- WhatsApp CRM — SCHEMA (SNAPSHOT completo al día)
-- Correr PRIMERO en el SQL editor de Supabase.
-- Orden y detalle de migraciones: ver supabase/MIGRATIONS.md
-- Este archivo es un snapshot; incluye lo que agregan los deltas (flows,
-- roles, logo, event_logs, handoff). Fresh install: schema -> policies -> seed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tenants (cada cliente = un numero de WhatsApp Business)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_phone_id text not null unique,   -- phone_number_id que manda Meta en el webhook
  logo_url text,                            -- URL publica del logo (bucket tenant-logos)
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- profiles (vincula un usuario de Supabase Auth con su tenant) — 1 user = 1 tenant
-- Necesario para que el RLS sepa a que tenant pertenece quien se loguea.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,  -- null = admin (sin tenant)
  role text not null default 'member' check (role in ('member','admin','tenant_admin')),  -- admin (global) ve todos; tenant_admin = member con override de handoff
  created_at timestamptz default now(),
  constraint profiles_tenant_role_chk check ((role = 'admin') or (tenant_id is not null))  -- member siempre con tenant
);

-- ---------------------------------------------------------------------------
-- contacts (uno por sender de WhatsApp por tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  name text,
  needs text,                               -- autollenado por IA (editable en el CRM)
  status text default 'new' check (status in ('new','active','resolved','archived')),
  last_message_at timestamptz,
  last_message_preview text,
  flow_state jsonb not null default '{}'::jsonb,  -- estado de menú: { current_menu, muted_date, path, awaiting_query, urgent }
  handoff boolean not null default false,         -- humano al control (columna dedicada; ver handoff-column.sql)
  created_at timestamptz default now(),
  unique (tenant_id, phone)
);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  whatsapp_message_id text unique,          -- dedup real: Meta reintenta cada webhook
  direction text check (direction in ('inbound','outbound')),
  content text,
  message_type text default 'text',
  sent_at timestamptz not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text default '#6366f1'
);

-- ---------------------------------------------------------------------------
-- contact_labels (N:N entre contacts y labels)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_labels (
  contact_id uuid references public.contacts(id) on delete cascade,
  label_id uuid references public.labels(id) on delete cascade,
  primary key (contact_id, label_id)
);

-- ---------------------------------------------------------------------------
-- bot_configs (config de IA por tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.bot_configs (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean default true,
  system_prompt text,
  reply_delay_seconds int default 2,
  flow_type text not null default 'ai' check (flow_type in ('ai','menu')),  -- 'ai': Claude libre · 'menu': flujo guiado
  flow_definition jsonb,                                                     -- árbol del flujo (solo modo menu)
  alert_email text,                                                          -- casilla para alertas de handoff (vacío = off)
  alert_delay_minutes int not null default 5                                 -- minutos sin atender antes de alertar
);

-- ---------------------------------------------------------------------------
-- failed_messages (cola de reintentos para sends fallidos / fuera de ventana 24h)
-- ---------------------------------------------------------------------------
create table if not exists public.failed_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  contact_phone text,
  content text,
  error text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- event_logs (log durable de eventos para debug: flujo, envios, errores)
-- ---------------------------------------------------------------------------
create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text,
  source text not null default 'n8n',   -- webhook | n8n | crm
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  event text not null,
  message text,
  data jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indices (performance de RLS y queries del dashboard)
-- ---------------------------------------------------------------------------
create index if not exists idx_event_logs_tenant_created  on public.event_logs (tenant_id, created_at desc);
create index if not exists idx_event_logs_contact_created on public.event_logs (contact_id, created_at desc);
create index if not exists idx_profiles_user        on public.profiles (user_id);
create index if not exists idx_contacts_tenant_last  on public.contacts (tenant_id, last_message_at desc);
create index if not exists idx_messages_contact_sent on public.messages (contact_id, sent_at);
create index if not exists idx_messages_tenant       on public.messages (tenant_id);
create index if not exists idx_labels_tenant         on public.labels (tenant_id);
create index if not exists idx_failed_tenant         on public.failed_messages (tenant_id);

-- ---------------------------------------------------------------------------
-- Realtime: publicar contacts y messages (el realtime respeta RLS por sesion)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.messages;
