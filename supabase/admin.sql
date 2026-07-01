-- ============================================================================
-- WhatsApp CRM — ROLES Y ACCESO ADMIN
-- Correr en Supabase -> SQL Editor, DESPUES de schema.sql / policies.sql.
--
-- Agrega un rol por usuario (member|admin). El admin puede ver/editar TODOS
-- los tenants (su sesion anon, sin service role en el CRM) gracias a is_admin().
-- Cambios aditivos: usuarios existentes quedan como 'member'.
-- ============================================================================

-- 1) Rol en profiles
alter table public.profiles
  add column if not exists role text not null default 'member'
    check (role in ('member','admin'));

-- 2) Helper is_admin() — SECURITY INVOKER (mismo patron que current_tenant_id).
-- Solo lee la propia fila de profiles (permitida por profiles_self): sin recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- 3) Policies: agregar OR is_admin() para que el admin abarque todos los tenants.
--    (profiles_self NO se toca para evitar recursion en is_admin()).

-- tenants
drop policy if exists "tenant_self_select" on public.tenants;
create policy "tenant_self_select" on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id() or public.is_admin());

-- contacts
drop policy if exists "tenant_isolation_contacts" on public.contacts;
create policy "tenant_isolation_contacts" on public.contacts
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_admin());

-- messages
drop policy if exists "tenant_isolation_messages" on public.messages;
create policy "tenant_isolation_messages" on public.messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_admin());

-- labels
drop policy if exists "tenant_isolation_labels" on public.labels;
create policy "tenant_isolation_labels" on public.labels
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_admin());

-- contact_labels (via el contacto)
drop policy if exists "tenant_isolation_contact_labels" on public.contact_labels;
create policy "tenant_isolation_contact_labels" on public.contact_labels
  for all to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.tenant_id = public.current_tenant_id()
    )
  );

-- bot_configs
drop policy if exists "tenant_isolation_bot_configs" on public.bot_configs;
create policy "tenant_isolation_bot_configs" on public.bot_configs
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_admin());

-- failed_messages
drop policy if exists "tenant_isolation_failed_messages" on public.failed_messages;
create policy "tenant_isolation_failed_messages" on public.failed_messages
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_admin());

-- 4) Marcar al admin. El email está parametrizado en la variable de abajo.
do $$
declare
  v_admin_email text := 'nlopez@cepidesigns.com.ar';  -- CAMBIAR: email del admin
begin
  update public.profiles
  set role = 'admin'
  where user_id = (select id from auth.users where email = v_admin_email);
end $$;
