-- ============================================================================
-- WhatsApp CRM — SEED DEMO
-- Correr DESPUES de schema.sql y policies.sql.
--
-- Crea 1 tenant demo + su bot_config + labels predefinidas, y deja listo el
-- linkeo del usuario demo a ese tenant.
--
-- IMPORTANTE: el usuario de Auth NO se puede crear desde SQL. Pasos:
--   1) Corre los bloques 1-3 de abajo.
--   2) En Supabase Dashboard -> Authentication -> Users -> "Add user"
--      crea un usuario con email demo@tuempresa.com (o el que quieras).
--   3) Corre el bloque 4 (linkea ese usuario al tenant demo via su email).
-- ============================================================================

-- ---- 1) Tenant demo --------------------------------------------------------
-- Reemplaza whatsapp_phone_id por el phone_number_id real de tu app de Meta.
insert into public.tenants (id, name, whatsapp_phone_id)
values ('00000000-0000-0000-0000-0000000000a1', 'Empresa Demo', 'REEMPLAZAR_PHONE_NUMBER_ID')
on conflict (id) do nothing;

-- ---- 2) Bot config del tenant demo ----------------------------------------
insert into public.bot_configs (tenant_id, enabled, system_prompt, reply_delay_seconds)
values (
  '00000000-0000-0000-0000-0000000000a1',
  true,
  'Sos el asistente de atencion al cliente de Empresa Demo. Responde en espanol, '
  || 'de forma breve, amable y util. Si no sabes algo, ofrece derivar a un humano. '
  || 'No inventes precios ni stock.',
  2
)
on conflict (tenant_id) do nothing;

-- ---- 3) Labels predefinidas -----------------------------------------------
insert into public.labels (tenant_id, name, color) values
  ('00000000-0000-0000-0000-0000000000a1', 'Lead',        '#22c55e'),
  ('00000000-0000-0000-0000-0000000000a1', 'Cliente',     '#6366f1'),
  ('00000000-0000-0000-0000-0000000000a1', 'Soporte',     '#f59e0b'),
  ('00000000-0000-0000-0000-0000000000a1', 'Urgente',     '#ef4444'),
  ('00000000-0000-0000-0000-0000000000a1', 'Seguimiento', '#06b6d4')
on conflict do nothing;

-- ---- 4) Linkear usuario demo al tenant (correr DESPUES de crear el user) ---
-- Cambia el email si usaste otro al crear el usuario en el dashboard.
insert into public.profiles (user_id, tenant_id)
select u.id, '00000000-0000-0000-0000-0000000000a1'
from auth.users u
where u.email = 'demo@tuempresa.com'
on conflict (user_id) do update set tenant_id = excluded.tenant_id;
