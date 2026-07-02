-- ============================================================================
-- WhatsApp CRM — HANDOFF MULTI-AGENTE (ownership por conversación)
-- Correr en Supabase -> SQL Editor, DESPUES de chat-attachments.sql
-- (paso #13 del orden canónico; ver MIGRATIONS.md). Idempotente.
--
-- Varios agentes del mismo tenant ven todas las conversaciones, pero cuando uno
-- "toma" una (handoff), queda como dueño: el resto solo la ve. En la tarjeta se
-- muestra quién la tomó. El nombre del dueño se DENORMALIZA (handoff_by_name)
-- para no tener que leer el profile de otro agente (RLS de profiles es self-only).
-- ============================================================================

-- 1) Ownership del handoff en el contacto (aditivo, nullable).
alter table public.contacts
  add column if not exists handoff_by uuid references auth.users(id) on delete set null,
  add column if not exists handoff_by_name text,      -- nombre para mostrar (denormalizado)
  add column if not exists handoff_at timestamptz;      -- cuándo se tomó

-- 2) Nombre para mostrar del agente (se setea en el alta de usuarios).
alter table public.profiles
  add column if not exists display_name text;

-- Nota: no hacen falta policies nuevas. contacts ya está tenant-scoped por RLS;
-- el enforcement de "solo el dueño (o admin) envía/libera" se hace en las server
-- actions del CRM. El claim es atómico (update condicional handoff_by is null).
