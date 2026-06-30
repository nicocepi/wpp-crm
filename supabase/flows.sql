-- ============================================================================
-- WhatsApp CRM — FLUJOS DE MENÚ POR CLIENTE (multi-flow)
-- Correr DESPUES de schema.sql / policies.sql / seed.sql.
--
-- Agrega soporte para flujos de menú guiado determinístico por tenant.
-- Cambios ADITIVOS: los tenants existentes quedan en flow_type='ai' (modo IA actual).
-- ============================================================================

-- ---- bot_configs: tipo de flujo + definición ------------------------------
alter table public.bot_configs
  add column if not exists flow_type text not null default 'ai'
    check (flow_type in ('ai','menu'));

alter table public.bot_configs
  add column if not exists flow_definition jsonb;

-- ---- contacts: estado de la conversación de menú --------------------------
-- Forma: { "current_menu": <node_id|null>, "muted_date": "YYYY-MM-DD"|null }
alter table public.contacts
  add column if not exists flow_state jsonb not null default '{}'::jsonb;
