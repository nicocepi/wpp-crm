# Logging y observabilidad

Qué se registra en el sistema y dónde mirarlo para debuggear una conversación o un problema del flujo.

## Fuentes de verdad (ya existían)
- **Conversaciones**: tabla `messages` — todo inbound/outbound con `content`, `direction`, `sent_at`, `whatsapp_message_id`. Reconstruye cualquier chat.
- **Errores de envío**: tabla `failed_messages` — fallos de envío a Meta / fuera de ventana 24h / bot off.
- **Estado del contacto**: `contacts.flow_state` — snapshot (`current_menu`, `path`, `handoff`, `urgent`, `awaiting_query`).
- **Ejecuciones de n8n**: paso a paso de cada corrida (en el Postgres interno de n8n, pestaña Executions). Es efímero (n8n poda) y no tenant-friendly, pero sirve para debug reciente.

## Nuevo: `event_logs` (log durable y consultable)
Tabla `event_logs` (`supabase/event-logs.sql`, reflejada en `schema.sql`/types): `tenant_id`, `contact_id`, `phone`, `source` (webhook|n8n|crm), `level` (debug|info|warn|error), `event`, `message`, `data` (jsonb), `created_at`. Índices por `(tenant_id, created_at)` y `(contact_id, created_at)`.
- **RLS**: SELECT para el tenant propio o admin. El insert lo hace **n8n con service role** (bypassa RLS); los miembros no escriben.
- **n8n** escribe (nodos con `onError: continueRegularOutput`, no rompen el flujo):
  - `Log flow (menu)` (fan-out del `Menu engine`): `event=menu_decision`, `data` = texto del contacto, `path`, menú destino, `handoff`, `awaiting_query`, `should_send`, `handoff_triggered`, `summary_triggered`.
  - `Log flow (ai)` (fan-out de `prep AI`): `event=ai_reply`, `data` = texto, `within24h`, `can_reply`, `enabled`.

## Webhook: logs estructurados
`apps/webhook/src/index.ts` emite **una línea JSON por evento** (`{ts, svc, level, event, ...}`): `listening`, `signature_invalid`, `duplicate_ignored`, `forward_n8n`. Greppables en el stdout del host (PM2/docker/journald). No se persisten en DB (el webhook es un forwarder liviano; lo relevante del flujo ya lo loguea n8n).

## CRM: sección Logs (admin)
`/logs` (route group `(admin)`, solo admin): tabla de `event_logs` con filtros por **tenant**, **nivel** y **búsqueda** (teléfono / evento / mensaje), últimos 300. Cada fila expande el `data` (jsonb). Para debuggear un contacto: filtrar por su teléfono.

## Pendiente / notas
- **Correr `supabase/event-logs.sql`**. Hasta entonces, la página `/logs` muestra vacío y los nodos de log de n8n fallan silenciosamente (no rompen el flujo).
- Retención: hoy sin TTL. Si crece mucho, agregar un cron de borrado (ej. > 90 días).
- No se loguean los prompts completos de Claude (solo el resultado/decisión) para no inflar storage; se puede sumar como `level=debug` si hace falta.
