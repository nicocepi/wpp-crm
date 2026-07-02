# Migraciones SQL — orden canónico

Los cambios de base se aplican corriendo estos archivos **en orden** en el SQL Editor de Supabase
(no hay aún `supabase db push`; ver "Pendiente" abajo). Todos son idempotentes
(`if not exists` / `drop policy if exists`), así que re-correrlos es seguro.

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `schema.sql` | **Snapshot completo** del esquema (tablas, índices, realtime). Ver nota abajo. |
| 2 | `policies.sql` | RLS: `current_tenant_id()` + policies por tenant. |
| 3 | `seed.sql` | Tenant demo + bot_config + labels + link del user demo. |
| 4 | `flows.sql` | Columnas `bot_configs.flow_type`/`flow_definition` + `contacts.flow_state`. |
| 5 | `seed-rq.sql` | Renombra el tenant a RQ + carga el flujo de menú. |
| 6 | `admin.sql` | Rol (`profiles.role`) + `is_admin()` + RLS `OR is_admin()` + marca al admin. |
| 7 | `users-admin.sql` | `profiles.tenant_id` nullable + admin sin tenant. |
| 8 | `tenant-logo.sql` | Columna `tenants.logo_url` (bucket `tenant-logos` se crea por Storage API). |
| 9 | `event-logs.sql` | Tabla `event_logs` (log durable) + RLS. |
| 10 | `handoff-column.sql` | Columna `contacts.handoff` (+ backfill) + CHECK rol↔tenant en `profiles`. |
| 11 | `impersonation-rls.sql` | `is_impersonating()` + redefine `current_tenant_id()` (honra header) + recrea policies: el bypass de admin se desactiva mientras impersona. |
| 12 | `chat-attachments.sql` | Columnas `messages.media_url/media_mime/media_filename` + bucket privado `chat-attachments` + Storage RLS (lectura por tenant). |
| 13 | `multi-agent-handoff.sql` | `contacts.handoff_by/handoff_by_name/handoff_at` (ownership del handoff) + `profiles.display_name`. |
| 14 | `tenant-admin-role.sql` | Amplía el CHECK de `profiles.role` para incluir `tenant_admin` (admin por-tenant: override de handoff, no admin global). |
| 15 | `handoff-alert-config.sql` | `bot_configs.alert_email` + `alert_delay_minutes` (alerta por email cuando un handoff queda sin atender). |

## Nota sobre `schema.sql` (drift)
`schema.sql` es un **snapshot al día** del esquema completo (incluye lo que agregan las
migraciones 4, 6, 7, 8, 9, 10). Para un **fresh install** alcanza con correr `schema.sql` +
`policies.sql` + `seed.sql` (+ `seed-rq.sql`). Las migraciones 4/6–10 son los **deltas
históricos**: solo hacen falta para actualizar una base creada **antes** de cada cambio. Por eso
algunos objetos (ej. `event_logs`, `contacts.handoff`) aparecen tanto en el snapshot como en su
delta — es intencional y todos son idempotentes.

## Email del admin (parametrizado)
En `admin.sql` y `users-admin.sql` el email del admin está en una variable al inicio del bloque
`do $$ ... $$` marcada con `-- CAMBIAR`. Editá esa línea si el admin es otro.

## Pendiente (deuda, cuando haya staging/prod)
Adoptar el flujo formal de **supabase migrations** (carpeta `supabase/migrations/NNNN_*.sql` +
`supabase db push`) para orden determinista y estado reproducible entre entornos. Hoy, con 1
entorno, el orden documentado acá alcanza.
