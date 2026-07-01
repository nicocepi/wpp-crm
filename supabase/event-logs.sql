-- ============================================================================
-- WhatsApp CRM — EVENT LOGS (log durable y consultable)
-- Correr en Supabase -> SQL Editor, DESPUES de schema.sql / policies.sql.
--
-- Registro de eventos del sistema para debug: decisiones del flujo, envíos,
-- errores. Lo escribe n8n con la SERVICE ROLE KEY (bypassa RLS). El dashboard
-- (admin / miembros de su tenant) solo lee.
-- ============================================================================

create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text,
  source text not null default 'n8n',   -- webhook | n8n | crm
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  event text not null,                   -- ej: inbound, menu_decision, ai_reply, send_ok, send_failed
  message text,
  data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_event_logs_tenant_created
  on public.event_logs (tenant_id, created_at desc);
create index if not exists idx_event_logs_contact_created
  on public.event_logs (contact_id, created_at desc);

alter table public.event_logs enable row level security;

-- Solo lectura para el usuario (su tenant) o el admin (todos). El insert lo
-- hace n8n con service role (bypassa RLS); no hay policy de insert para
-- authenticated, asi que los miembros no pueden escribir logs.
drop policy if exists "event_logs_select" on public.event_logs;
create policy "event_logs_select" on public.event_logs
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin());
