-- ============================================================================
-- WhatsApp CRM — RLS POLICIES
-- Correr DESPUES de schema.sql.
--
-- Modelo: 1 user = 1 tenant (tabla profiles). El helper current_tenant_id()
-- resuelve el tenant del usuario logueado y todas las policies lo usan.
--
-- Notas de seguridad (best practices Supabase):
--  - RLS habilitado en TODAS las tablas del schema public.
--  - Policies con `to authenticated` + predicado de pertenencia (no solo el rol).
--  - `for all` aplica USING a SELECT/UPDATE/DELETE y WITH CHECK a INSERT/UPDATE.
--  - n8n escribe con la SERVICE ROLE KEY, que bypassea RLS (correcto para backend).
--  - El dashboard usa la ANON KEY + sesion del usuario, con RLS activo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: tenant_id del usuario logueado.
-- SECURITY INVOKER: corre como el usuario y lee su propia fila de profiles
-- (permitida por la policy profiles_self). No hay recursion porque la policy
-- de profiles solo referencia auth.uid(). Evita el lint de SECURITY DEFINER
-- ejecutable publicamente.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select tenant_id from public.profiles where user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.contacts         enable row level security;
alter table public.messages         enable row level security;
alter table public.labels           enable row level security;
alter table public.contact_labels   enable row level security;
alter table public.bot_configs      enable row level security;
alter table public.failed_messages  enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: el usuario solo ve/edita su propia fila
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tenants: el usuario solo ve su tenant
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_self_select" on public.tenants;
create policy "tenant_self_select" on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- contacts: aislado por tenant
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_contacts" on public.contacts;
create policy "tenant_isolation_contacts" on public.contacts
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- messages: aislado por tenant
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_messages" on public.messages;
create policy "tenant_isolation_messages" on public.messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- labels: aislado por tenant
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_labels" on public.labels;
create policy "tenant_isolation_labels" on public.labels
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- contact_labels: aislado via el contacto (no tiene tenant_id propio)
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_contact_labels" on public.contact_labels;
create policy "tenant_isolation_contact_labels" on public.contact_labels
  for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  );

-- ---------------------------------------------------------------------------
-- bot_configs: aislado por tenant
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_bot_configs" on public.bot_configs;
create policy "tenant_isolation_bot_configs" on public.bot_configs
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- failed_messages: aislado por tenant (UI de reintentos). El insert lo hace
-- n8n con service role; el usuario solo lee/borra los de su tenant.
-- ---------------------------------------------------------------------------
drop policy if exists "tenant_isolation_failed_messages" on public.failed_messages;
create policy "tenant_isolation_failed_messages" on public.failed_messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
