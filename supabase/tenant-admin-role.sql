-- ============================================================================
-- WhatsApp CRM — ROL "tenant_admin" (admin a nivel tenant)
-- Correr en Supabase -> SQL Editor, DESPUES de multi-agent-handoff.sql
-- (paso #14 del orden canónico; ver MIGRATIONS.md). Idempotente.
--
-- Nuevo rol por-tenant `tenant_admin`: igual que un member (ve solo su tenant,
-- NO es admin global -> is_admin() sigue false), pero puede tomar/liberar la
-- conversación de otro agente (override de handoff). El enforcement del override
-- vive en las server actions del CRM. En la UI se muestra como "Admin".
--
-- IMPORTANTE: no se reusa el rol 'admin' (ese es el admin GLOBAL, tenant_id null,
-- que ve todos los tenants vía is_admin()). Un tenant_admin tiene tenant_id.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('member','admin','tenant_admin'));

-- El CHECK rol↔tenant (profiles_tenant_role_chk) ya exige tenant_id para todo lo
-- que no sea 'admin' global -> tenant_admin (con tenant) lo cumple sin cambios.
