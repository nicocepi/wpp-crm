# Módulo de agendamiento de turnos

Permite que un contacto **solicite, confirme, cancele y reprograme turnos desde WhatsApp**,
con disponibilidad calculada en backend, gestión desde el panel y aislamiento total por tenant.
Se activa por empresa con un feature flag; las empresas sin turnos funcionan igual que antes.

## Arquitectura (Alternativa C)

- **El CRM (Postgres/Supabase) es la fuente de verdad.** Toda la disponibilidad y los turnos
  viven en la base del CRM.
- **Google Calendar** es sincronización externa **diferida a Fase 2** (hoy solo scaffolding:
  tablas `gcal_connections` / `gcal_sync_outbox`, campos de sync en `appointments` y estados).
  Un error de Google nunca impide crear el turno interno (queda `sync_status='pending'`).
- **WhatsApp**: sub-flujo de **menú determinístico** dentro de n8n (`n8n/build-workflow.mjs`,
  nodo "Appt engine") que **no inventa horarios**: consulta los endpoints internos del CRM.

### Componentes

| Capa | Ubicación |
|---|---|
| Esquema + funciones SQL | `supabase/appointments.sql` |
| Motor de disponibilidad (puro) | `apps/crm/lib/appointments/availability.ts` |
| Jerarquía de configuración | `apps/crm/lib/appointments/config.ts` |
| Carga de datos + orquestación | `apps/crm/lib/appointments/repository.ts` |
| Servicio (hold/confirm/cancel/reschedule) | `apps/crm/lib/appointments/service.ts` |
| Endpoints internos (n8n) | `apps/crm/app/api/internal/appointments/*` |
| Panel admin | `apps/crm/app/(dashboard)/agenda/**` |
| Sub-flujo WhatsApp | `n8n/build-workflow.mjs` (nodo "Appt engine") |

## Prevención de doble reserva

La reserva final pasa por la función SQL `book_appointment(...)` que, en una transacción:
1. Idempotencia por `idempotency_key` (devuelve el turno existente).
2. `pg_advisory_xact_lock` por (profesional, inicio) → serializa las tx concurrentes de esa franja.
3. Cuenta turnos **solapados** que consumen cupo (`held` no vencido + `pending` + `confirmed`)
   y lo compara con el cupo resuelto. Si no entra → `slot_full`.
4. Inserta y audita.

Esto cubre el caso `max_per_slot > 1` (un `unique` simple no alcanza). Cancelados, vencidos y
reprogramados **no** consumen cupo. Las retenciones vencidas se ignoran en las consultas (lazy) y
`expire_appointment_holds()` las limpia (opcionalmente vía pg_cron, comentado en el SQL).

## Jerarquía de configuración

Resuelta en `config.ts` y reflejada en el SQL:

- **Duración del turno**: profesional+tratamiento → tratamiento → empresa.
- **Tamaño de franja**: profesional+tratamiento → profesional → empresa.
- **Cupo por franja** (`max_per_slot`): profesional+tratamiento → profesional → 1.

## Flujo de WhatsApp (sub-flujo de menú)

Estado en `contacts.flow_state` (`appt_*`), reusando el estado conversacional existente:

1. Detecta intención ("turno", "cancelar", "reprogramar", "mis turnos").
2. Verifica módulo habilitado (los endpoints devuelven 403 si no).
3. Elegir tratamiento → profesional (o "cualquiera") → horario real (endpoint availability).
4. `hold` (retención con vencimiento) → pide confirmación → `confirm`.
5. Cancelar/reprogramar: lista los turnos futuros del contacto y opera.

Reglas: las opciones salen siempre del backend; el turno se confirma **solo tras OK del backend**;
idempotencia con `idempotency_key` para no duplicar ante mensajes repetidos; todo scoped por el
`tenant_id` resuelto del `phone_number_id`.

## Trazabilidad y auditoría

- **`correlation_id`** (uuid) se genera al iniciar el sub-flujo y se propaga:
  `flow_state.appt_correlation_id` → endpoints → `book_appointment` → `appointments.correlation_id`
  → `appointment_audit` → `gcal_sync_outbox`.
- **`appointment_audit`**: quién hizo qué (creado/confirmado/cancelado/reprogramado/estado), con
  `actor_source` (whatsapp|admin|scheduled|sync) y `old/new_values`.
- **`event_logs`**: eventos operativos (`appt_hold`, `appt_confirm`, `appt_slot_full`, `appt_flow`, …).
- Nunca se loguean tokens ni datos sensibles.

## Endpoints internos (consumidos por n8n)

`POST /api/internal/appointments/{availability|hold|confirm|cancel|reschedule|upcoming|catalog}`
Header `x-appointment-secret: $APPOINTMENTS_INTERNAL_SECRET`. `tenant_id` explícito y validado.

## Google Calendar — diseño de Fase 2 (no implementado)

1. OAuth 2.0 por empresa (y opcionalmente por profesional). Redirect URI: `{CRM}/api/integrations/google/callback`.
2. Tokens **cifrados** en `gcal_connections` (pgsodium/Supabase Vault o `GCAL_TOKEN_ENCRYPTION_KEY`).
   Nunca en texto plano, nunca al frontend, nunca en logs.
3. Al confirmar/reprogramar/cancelar un turno, si `gcal_sync_enabled`, se encola en `gcal_sync_outbox`.
4. Worker (n8n scheduleTrigger o cron) procesa el outbox con reintentos y backoff; actualiza
   `appointments.sync_status` (`pending|synced|failed`) y permite reintento manual desde el panel.
5. Vincular evento↔turno con `extendedProperties.private` (no solo el título).

## Probar localmente

Ver la sección **"Módulo de turnos (local)"** del `README.md`.
