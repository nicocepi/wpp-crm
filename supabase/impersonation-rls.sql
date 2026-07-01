-- ============================================================================
-- WhatsApp CRM — IMPERSONACIÓN REFLEJADA EN RLS
-- Correr en Supabase -> SQL Editor, DESPUES de policies.sql / admin.sql /
-- event-logs.sql (es el paso #11 del orden canónico; ver MIGRATIONS.md).
--
-- Problema que resuelve:
--   Antes, la impersonación ("ingresar como un tenant") vivía SOLO en el server
--   de Next (cookie httpOnly act_as_tenant). RLS no la conocía: el admin seguía
--   con is_admin()=true y las policies `... OR is_admin()` le permitían ver/
--   escribir TODOS los tenants. Lo único que lo acotaba era el filtro manual
--   .eq("tenant_id", ...) en cada query. Frágil: una query sin ese filtro
--   filtraría datos cruzados al sumar un 2º tenant.
--
-- Solución:
--   El server de Next reenvía el tenant impersonado en el header
--   `x-impersonate-tenant` (tomado de la cookie). PostgREST lo expone en
--   current_setting('request.headers'). RLS lo honra SOLO si el usuario es
--   admin (is_admin()), y mientras impersona se DESACTIVA el bypass de admin.
--   Así, un admin impersonando queda acotado al tenant impersonado por RLS.
--
-- Seguridad:
--   - Un member nunca pasa el gate is_admin() => no puede forjar el header para
--     escalar; sigue viendo solo su tenant.
--   - Un admin ya ve todo; setear el header solo lo RESTRINGE (no escala).
--   - El header lo inyecta el server desde una cookie httpOnly (el browser no lo
--     puede setear).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_impersonating(): true si el usuario es admin Y viaja el header de
-- impersonación. SECURITY INVOKER (mismo patrón que is_admin/current_tenant_id).
-- ---------------------------------------------------------------------------
create or replace function public.is_impersonating()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_admin()
    and nullif(current_setting('request.headers', true)::json ->> 'x-impersonate-tenant', '') is not null;
$$;

-- ---------------------------------------------------------------------------
-- current_tenant_id(): si el admin impersona, devuelve el tenant del header;
-- si no, el tenant propio del profile. Sin recursión: solo toca la fila propia
-- de profiles (policy profiles_self usa solo auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when public.is_impersonating()
      then nullif(current_setting('request.headers', true)::json ->> 'x-impersonate-tenant', '')::uuid
    else (select tenant_id from public.profiles where user_id = (select auth.uid()))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Recrear las policies tenant-scoped: el bypass de admin ahora se desactiva
-- mientras impersona -> `or (is_admin() and not is_impersonating())`.
-- (profiles_self NO se toca: no es tenant-scoped y evita recursión.)
-- ---------------------------------------------------------------------------

-- tenants
drop policy if exists "tenant_self_select" on public.tenants;
create policy "tenant_self_select" on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- contacts
drop policy if exists "tenant_isolation_contacts" on public.contacts;
create policy "tenant_isolation_contacts" on public.contacts
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- messages
drop policy if exists "tenant_isolation_messages" on public.messages;
create policy "tenant_isolation_messages" on public.messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- labels
drop policy if exists "tenant_isolation_labels" on public.labels;
create policy "tenant_isolation_labels" on public.labels
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- contact_labels (via el contacto)
drop policy if exists "tenant_isolation_contact_labels" on public.contact_labels;
create policy "tenant_isolation_contact_labels" on public.contact_labels
  for all to authenticated
  using (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    (public.is_admin() and not public.is_impersonating()) or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  );

-- bot_configs
drop policy if exists "tenant_isolation_bot_configs" on public.bot_configs;
create policy "tenant_isolation_bot_configs" on public.bot_configs
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- failed_messages
drop policy if exists "tenant_isolation_failed_messages" on public.failed_messages;
create policy "tenant_isolation_failed_messages" on public.failed_messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()))
  with check (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));

-- event_logs (solo lectura para el usuario / admin)
drop policy if exists "event_logs_select" on public.event_logs;
create policy "event_logs_select" on public.event_logs
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or (public.is_admin() and not public.is_impersonating()));
