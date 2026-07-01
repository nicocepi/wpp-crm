-- ============================================================================
-- WhatsApp CRM — HANDOFF COMO COLUMNA + CHECK rol/tenant
-- Correr en Supabase -> SQL Editor.
--
-- (Puntos 2 y 8 del relevamiento técnico.)
-- 1) Mueve el flag "handoff" de contacts.flow_state (jsonb) a una COLUMNA
--    dedicada. Evita el race: n8n nunca la pone en false (solo el CRM al
--    reactivar), asi que no pisa el toggle del agente.
-- 2) Constraint que ata rol<->tenant (un member siempre tiene tenant).
-- ============================================================================

-- 1) Columna handoff + backfill desde el jsonb existente.
alter table public.contacts
  add column if not exists handoff boolean not null default false;

update public.contacts
set handoff = true
where coalesce(flow_state->>'handoff', 'false') = 'true'
  and handoff = false;

-- 2) CHECK: el admin puede no tener tenant; un member siempre debe tenerlo.
alter table public.profiles
  drop constraint if exists profiles_tenant_role_chk;
alter table public.profiles
  add constraint profiles_tenant_role_chk
  check ((role = 'admin') or (tenant_id is not null));
