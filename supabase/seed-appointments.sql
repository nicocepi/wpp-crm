-- ============================================================================
-- WhatsApp CRM — SEED DEMO del MÓDULO DE TURNOS ("Centro Odontológico Demo")
-- Correr DESPUÉS de appointments.sql. Idempotente (on conflict do nothing).
-- NO ejecutar en producción: es data de demostración para probar el motor de
-- disponibilidad, cupos, excepciones y el flujo de WhatsApp localmente.
--
-- Para limpiar todo: ver el bloque "LIMPIEZA" comentado al final.
-- ============================================================================

-- ---- Tenant demo dedicado (aparte del "Empresa Demo" del seed base) --------
insert into public.tenants (id, name, whatsapp_phone_id)
values ('00000000-0000-0000-0000-0000000000a2', 'Centro Odontológico Demo', 'DEMO_ODONTO_PHONE_ID')
on conflict (id) do nothing;

-- ---- bot_configs: requerido para que n8n procese mensajes de este tenant ---
-- (el flujo de WhatsApp corta en "Get bot_config" si no hay fila; flow_type
-- 'menu' no importa para el sub-flujo de turnos, que corre antes del ruteo).
insert into public.bot_configs (tenant_id, enabled, system_prompt, reply_delay_seconds, flow_type)
values (
  '00000000-0000-0000-0000-0000000000a2', true,
  'Asistente del Centro Odontológico Demo.', 1, 'menu'
) on conflict (tenant_id) do nothing;

-- ---- Configuración del módulo (habilitado) ---------------------------------
insert into public.appointment_settings (
  tenant_id, enabled, timezone, slot_minutes, appointment_minutes,
  min_lead_minutes, max_advance_days, hold_minutes,
  allow_choose_professional, auto_assign_professional
) values (
  '00000000-0000-0000-0000-0000000000a2', true, 'America/Argentina/Buenos_Aires',
  30, 30, 120, 60, 10, true, false
) on conflict (tenant_id) do nothing;

-- ---- Especialidades --------------------------------------------------------
insert into public.specialties (id, tenant_id, name, description) values
  ('00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-0000000000a2', 'Odontología general', 'Consultas y limpiezas'),
  ('00000000-0000-0000-0000-00000000a202', '00000000-0000-0000-0000-0000000000a2', 'Ortodoncia', 'Brackets y controles'),
  ('00000000-0000-0000-0000-00000000a203', '00000000-0000-0000-0000-0000000000a2', 'Endodoncia', 'Tratamientos de conducto')
on conflict (id) do nothing;

-- ---- Tratamientos (duración distinta para probar franjas/cupos) ------------
insert into public.treatments (id, tenant_id, specialty_id, name, duration_minutes, buffer_minutes) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a201', 'Consulta inicial', 30, 0),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a201', 'Limpieza dental', 60, 0),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a202', 'Control de ortodoncia', 30, 0),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a203', 'Endodoncia', 90, 15)
on conflict (id) do nothing;

-- ---- Profesionales (cupos distintos: Ana 1, Martín 2) ----------------------
insert into public.professionals (id, tenant_id, first_name, last_name, max_per_slot, color) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', 'Ana', 'Pérez', 1, '#6366f1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', 'Martín', 'Gómez', 2, '#22c55e')
on conflict (id) do nothing;

-- ---- Vínculos especialidad/tratamiento por profesional ---------------------
insert into public.professional_specialties (professional_id, specialty_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a202'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000a203')
on conflict do nothing;

-- Ana: consulta, limpieza, control orto. Martín: consulta, endodoncia.
insert into public.professional_treatments (professional_id, treatment_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d3'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d4')
on conflict do nothing;

-- ---- Horarios habituales (weekday: 0=dom ... 6=sáb) ------------------------
-- Ana: lunes y miércoles, jornada partida 09-13 y 15-19.
insert into public.professional_schedules (tenant_id, professional_id, weekday, start_time, end_time) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 1, '09:00', '13:00'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 1, '15:00', '19:00'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 3, '09:00', '13:00'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 3, '15:00', '19:00'),
  -- Martín: martes y jueves, 10-16 corrido.
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2', 2, '10:00', '16:00'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2', 4, '10:00', '16:00')
on conflict do nothing;

-- ---- Excepciones (feriado global + un bloqueo puntual de Ana) --------------
-- Feriado tenant-wide (professional_id null) — ejemplo genérico, ajustá la fecha.
insert into public.availability_exceptions (tenant_id, professional_id, date, type, reason) values
  ('00000000-0000-0000-0000-0000000000a2', null, '2030-05-01', 'holiday', 'Día del Trabajador'),
  -- Ana bloquea la tarde de un miércoles puntual.
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', '2030-05-08', 'block', 'Capacitación')
on conflict do nothing;

-- ============================================================================
-- LIMPIEZA (descomentar para borrar toda la data demo de turnos):
--   delete from public.appointments where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.professional_schedules where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.availability_exceptions where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.professional_treatments where professional_id in (select id from public.professionals where tenant_id = '00000000-0000-0000-0000-0000000000a2');
--   delete from public.professional_specialties where professional_id in (select id from public.professionals where tenant_id = '00000000-0000-0000-0000-0000000000a2');
--   delete from public.professionals where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.treatments where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.specialties where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.appointment_settings where tenant_id = '00000000-0000-0000-0000-0000000000a2';
--   delete from public.tenants where id = '00000000-0000-0000-0000-0000000000a2';
-- ============================================================================
