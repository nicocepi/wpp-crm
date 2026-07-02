-- ============================================================================
-- WhatsApp CRM — ALERTAS DE HANDOFF POR EMAIL (config por tenant)
-- Correr en Supabase -> SQL Editor, DESPUES de tenant-admin-role.sql
-- (paso #15 del orden canónico; ver MIGRATIONS.md). Idempotente.
--
-- Cuando el bot deriva a un agente, si pasados N minutos la conversación sigue
-- sin atender, el CRM manda un mail a la casilla configurada. Ambos valores se
-- setean por tenant en bot_configs. alert_email vacío/null = alerta desactivada.
-- ============================================================================

alter table public.bot_configs
  add column if not exists alert_email text,
  add column if not exists alert_delay_minutes int not null default 5;
