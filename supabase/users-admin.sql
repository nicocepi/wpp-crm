-- ============================================================================
-- WhatsApp CRM — ADMIN SIN TENANT + ABM de usuarios
-- Correr en Supabase -> SQL Editor, DESPUES de admin.sql.
--
-- El admin no pertenece a ningun tenant: tenant_id pasa a ser opcional.
-- (La gestion de usuarios -ABM- se hace desde el CRM con la service role key).
-- ============================================================================

-- 1) tenant_id opcional (el admin no tiene tenant).
alter table public.profiles
  alter column tenant_id drop not null;

-- 2) El admin queda sin tenant. Email parametrizado en la variable de abajo.
do $$
declare
  v_admin_email text := 'nlopez@cepidesigns.com.ar';  -- CAMBIAR: email del admin
begin
  update public.profiles
  set tenant_id = null
  where user_id = (select id from auth.users where email = v_admin_email);
end $$;
