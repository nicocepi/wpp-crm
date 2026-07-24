# Módulo de agendamiento de turnos

Permite que un contacto **solicite, confirme, cancele y reprograme turnos desde WhatsApp**,
con disponibilidad calculada en backend, gestión desde el panel y aislamiento total por tenant.
Se activa por empresa con un feature flag; las empresas sin turnos funcionan igual que antes.

## Arquitectura (Alternativa C)

- **El CRM (Postgres/Supabase) es la fuente de verdad.** Toda la disponibilidad y los turnos
  viven en la base del CRM.
- **Google Calendar** es sincronización externa, **por empresa** (una sola conexión OAuth por
  tenant, no por profesional). Un error de Google nunca impide crear el turno interno: el sync se
  intenta al momento y, si falla, queda `sync_status='failed'` con reintento manual desde el panel.
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

## Google Calendar

Conexión OAuth 2.0 **por empresa** (un solo Google Calendar para todos los profesionales del
tenant; conexión por-profesional queda para una fase futura si hace falta).

### Flujo OAuth

1. Desde `/agenda/config` (tenant impersonado o propio), botón **"Conectar con Google"** →
   `GET /api/integrations/google/authorize`.
2. Esa ruta resuelve el tenant de la sesión actual, genera un nonce, lo guarda junto al
   `tenant_id` en una cookie httpOnly de 10 minutos (`gcal_oauth_state`), y redirige a Google
   (`access_type=offline&prompt=consent` para garantizar `refresh_token`).
3. Google redirige a `GOOGLE_OAUTH_REDIRECT_URI` (`/api/integrations/google/callback`) con
   `code` + `state`. La ruta valida el nonce contra la cookie (CSRF), verifica que el usuario
   logueado tenga acceso a ese tenant (defensa en profundidad), intercambia el `code` por tokens,
   cifra `access_token`/`refresh_token` (AES-256-GCM, `apps/crm/lib/appointments/gcal-crypto.ts`,
   clave en `GCAL_TOKEN_ENCRYPTION_KEY`) y los guarda en `gcal_connections` (`calendar_id='primary'`
   por defecto). Los tokens **nunca** se envían al frontend ni se loguean completos.
4. **Desconectar**: revoca el token con Google (best-effort) y limpia la fila local
   (`disconnectGoogleCalendar` en `agenda/actions.ts`).

### Sincronización de eventos

`apps/crm/lib/appointments/gcal-sync.ts` (`attemptGcalSync`) es el único punto que habla con la
Calendar API. Se llama automáticamente desde `service.ts` — `confirmAppointment` (create),
`cancelAppointment` (delete), `rescheduleAppointment` (update: el turno nuevo **hereda el
`gcal_event_id`** del anterior para mover el mismo evento en vez de duplicarlo) — y manualmente
desde el botón **"Reintentar sync"** del panel (`retrySync`, resuelve la operación según el estado
actual del turno).

- No-op silencioso si el tenant no tiene `gcal_sync_enabled` o no hay conexión `connected`: el
  turno interno nunca depende de que esto funcione.
- El `access_token` se refresca automáticamente si venció (`getValidAccessToken`); si el
  `refresh_token` fue revocado, la conexión pasa a `status='error'` y el panel pide reconectar.
- Cada intento (éxito o error) escribe una fila en `gcal_sync_outbox` (auditoría/histórico, no
  cola activa — el reintento es manual, no hay worker programado) y un `event_logs`
  (`gcal_sync_ok` / `gcal_sync_error`), con `correlation_id`.
- El evento se vincula al turno vía `extendedProperties.private.crm_appointment_id` (no solo el
  título), y **no incluye información clínica** — solo tratamiento, profesional y el nombre/teléfono
  del contacto.

### Crear las credenciales de Google (paso a paso)

No hay credenciales por defecto — hay que crearlas una vez en Google Cloud Console:

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) y creá un proyecto (o usá
   uno existente).
2. **APIs & Services → Library** → buscá **"Google Calendar API"** → **Enable**.
3. **APIs & Services → OAuth consent screen**: tipo *External* (o *Internal* si es Google
   Workspace), completá nombre de la app y email de soporte. En modo *Testing* alcanza para
   desarrollo (agregá tu email como *test user*).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: agregá exactamente el valor de `GOOGLE_OAUTH_REDIRECT_URI`
     (local: `http://localhost:3001/api/integrations/google/callback` si tu dev server corre en
     el puerto 3001; producción: `https://tu-dominio/api/integrations/google/callback`).
5. Copiá **Client ID** y **Client secret** → van en `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. Generá la clave de cifrado local: `openssl rand -hex 32` → `GCAL_TOKEN_ENCRYPTION_KEY`.

## Probar localmente

Ver la sección **"Módulo de turnos (local)"** del `README.md`.
