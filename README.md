# WhatsApp CRM (multi-tenant)

CRM de WhatsApp **multi-tenant**: cada cliente (tenant) tiene su propio número de
WhatsApp Business. Un bot atiende por WhatsApp (flujo de menú guiado o IA), y
cuando hace falta, un agente humano **toma el control** del chat desde el
dashboard y responde en tiempo real. Todo aislado por tenant con Row Level
Security (RLS) de Postgres.

```
                         (entrante)                                   (saliente)
Meta WhatsApp ──► apps/webhook (Express) ──► n8n ──► Supabase ──► apps/crm (Next.js)
   Cloud API       verify + HMAC + dedup      │        Postgres      dashboard realtime
        ▲                                      ├──► Claude (needs + respuesta) ─► Meta
        │                                      └──► Storage (adjuntos de media)
        └───────────────── agente responde desde el CRM ◄────────────────────────┘
```

---

## Índice
- [Features](#features)
- [Stack](#stack)
- [Estructura del monorepo](#estructura-del-monorepo)
- [Flujo end-to-end](#flujo-end-to-end)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
  - [1. Supabase (base de datos)](#1-supabase-base-de-datos)
  - [2. Meta WhatsApp](#2-meta-whatsapp)
  - [3. Variables de entorno](#3-variables-de-entorno)
  - [4. n8n (orquestación)](#4-n8n-orquestación)
  - [5. Webhook](#5-webhook)
  - [6. CRM](#6-crm)
- [Roles y multi-tenancy](#roles-y-multi-tenancy)
- [Funcionalidades en detalle](#funcionalidades-en-detalle)
- [Migraciones SQL](#migraciones-sql)
- [Regenerar / re-importar el workflow de n8n](#regenerar--re-importar-el-workflow-de-n8n)
- [Seguridad](#seguridad)
- [Deploy](#deploy)
- [Referencia rápida (local)](#referencia-rápida-local)

---

## Features

- **Multi-tenant** con aislamiento por RLS (`current_tenant_id()` + `is_admin()`).
- **Bot por tenant en dos modos:**
  - **Menú guiado** (`flow_type='menu'`): árbol de nodos data-driven, navegación
    secuencial, "volver a empezar", mute por día, editable por tenant.
  - **IA** (`flow_type='ai'`): Claude responde libre según un system prompt.
- **Handoff a humano:** el agente toma el control (pausa el bot), responde desde
  el CRM y reactiva el bot al terminar. Resumen IA del recorrido en la caja de
  descripción, labels automáticas ("Necesita agente", "Urgente" clasificada por
  IA) y campanita de aviso.
- **Adjuntos en el chat:** el agente **envía** imágenes (PNG/JPG/WEBP) y PDF; se
  **reciben** imágenes, PDF y **audios** (notas de voz). Bucket privado + URL
  firmada.
- **Roles y admin:** usuarios `member` (ven solo su tenant) y `admin` (ve todos
  los tenants, estadísticas globales y config de cada uno).
- **Impersonación:** el admin "ingresa como" un tenant y usa la vista del member,
  acotado por RLS (no solo por filtro en el server).
- **ABM de usuarios** por tenant (alta/baja/listado, con Auth admin API).
- **Logo por tenant** (Storage) visible en el panel del member.
- **Métricas por tenant:** cuánta gente escribió, top motivos (nodo de menú),
  % de handoff (bot vs. agente) y mensajes fallidos.
- **Logging/observabilidad:** `messages`, `failed_messages` y un log durable
  `event_logs` (decisiones del flujo y envíos) con una vista **Logs** (admin).
- **Realtime:** los contactos y mensajes se actualizan en vivo (Supabase Realtime).

## Stack

- **CRM**: Next.js 14 (App Router, Server Actions) · TypeScript · Tailwind ·
  Radix UI (shadcn-style) · `@supabase/ssr`.
- **DB + Auth + Realtime + Storage**: Supabase (Postgres + RLS).
- **Webhook**: Node.js + Express (TypeScript).
- **Orquestación**: n8n (Docker), workflow generado por script.
- **IA**: Claude API (Anthropic) con prompt caching.
- **Tooling**: pnpm workspaces, Node ≥ 20.

## Estructura del monorepo

```
apps/
  crm/            Dashboard Next.js (App Router)
    app/          rutas: (auth), (dashboard), (dashboard)/(admin)
    components/   UI (contacts, settings, ui)
    lib/          supabase clients, tenant.ts (RLS/impersonación), tipos, métricas
  webhook/        Receptor de webhooks de Meta -> valida y reenvía a n8n
    src/          index.ts, signature.ts (HMAC), dedup.ts, whatsapp.ts, n8n.ts
n8n/
  build-workflow.mjs         Generador del workflow (fuente de verdad)
  whatsapp-agent-workflow.json  Workflow generado (importable)
  docker-compose.yml         n8n + Postgres
supabase/         Migraciones SQL (ver MIGRATIONS.md) + schema snapshot
docs/META_SETUP.md  Checklist de la app de Meta
```

> `obsidian/` (bóveda de documentación interna) está **gitignoreado**.

## Flujo end-to-end

**Entrante (cliente → CRM):**
1. Meta envía el webhook a `apps/webhook`, que verifica la firma HMAC, deduplica
   e ignora statuses, y **normaliza** el evento (incluye metadatos de media).
2. Reenvía a n8n, que resuelve el tenant por `phone_number_id`, hace upsert del
   contacto y persiste el mensaje. Si hay media, la **baja de Meta** y la sube a
   Storage.
3. Según `flow_type`: interpreta el menú o llama a Claude, y responde por la
   Cloud API (respetando la ventana de 24h).

**Handoff (agente ← → cliente):**
- Al derivar, se marca `contacts.handoff=true` (columna dedicada) → el bot queda
  en silencio. El agente responde desde el CRM (`sendAgentMessage` /
  `sendAgentAttachment`, que pegan directo a la Graph API). Al reactivar, se
  limpia el estado y el próximo mensaje reinicia el bot.

## Requisitos

- Node.js ≥ 20 y **pnpm** (`npm i -g pnpm`)
- Docker + Docker Compose (para n8n)
- Cuenta de Supabase, app de Meta WhatsApp Business, API key de Anthropic

## Puesta en marcha

```bash
pnpm install
```

### 1. Supabase (base de datos)

En el **SQL Editor** del proyecto, corré las migraciones **en el orden** de
[`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md). Para un *fresh install*
alcanza con `schema.sql` → `policies.sql` → `seed.sql` (+ `seed-rq.sql`); el
resto son deltas históricos, todos idempotentes. Ver la tabla más abajo.

Además:
- **Storage buckets**: `tenant-logos` (público) y `chat-attachments` (privado).
  El segundo se crea desde `chat-attachments.sql`; el primero vía Storage
  API/Dashboard (o el SQL comentado en `tenant-logo.sql`).
- **Usuario admin**: el email está parametrizado (`-- CAMBIAR`) en `admin.sql` /
  `users-admin.sql`.
- **Tipos TS** tras cambios de schema:
  ```bash
  npx supabase gen types typescript --project-id <REF> --schema public \
    > apps/crm/lib/database.types.ts
  ```

> Modelo: **1 usuario = 1 tenant** (`profiles`), salvo el admin (`tenant_id`
> null). El CRM usa la **anon key** + sesión (RLS activo); n8n y las subidas de
> media entrante usan la **service role key** (bypass RLS, server-only).

### 2. Meta WhatsApp

Seguí [`docs/META_SETUP.md`](docs/META_SETUP.md). Resumen:
1. App Business + producto WhatsApp; anotá **Phone number ID**, **App Secret**,
   **API Token** (usá un **token permanente**).
2. Definí un **Verify token** propio.
3. Configurá el webhook (`https://TU_DOMINIO/webhook`) y suscribí el campo
   `messages`.
4. Guardá el `phone_number_id` real en `tenants.whatsapp_phone_id`.

### 3. Variables de entorno

Tres lugares (todos gitignoreados). Nunca commitear secretos.

| Servicio | Variable | Archivo |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/crm/.env.local` |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | `apps/crm/.env.local` (server-only) y `n8n/.env` |
| App | `NEXT_PUBLIC_APP_URL` | `apps/crm/.env.local` |
| Meta | `WHATSAPP_API_TOKEN`, `WHATSAPP_GRAPH_VERSION` | `apps/crm/.env.local` y `n8n/.env` |
| Meta | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | webhook (`.env` raíz o `apps/webhook/.env`) |
| n8n | `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET` | webhook |
| n8n | `SUPABASE_URL`, `ANTHROPIC_API_KEY`, `WHATSAPP_API_TOKEN`, `N8N_WEBHOOK_SECRET`, `N8N_ENCRYPTION_KEY`, `POSTGRES_*` | `n8n/.env` |

> El CRM usa `SUPABASE_SERVICE_ROLE_KEY` **solo** en el server, detrás de
> `isAdmin()` (gestión de usuarios). El token de Meta también es server-only.

### 4. n8n (orquestación)

```bash
cd n8n
cp .env.example .env            # completá SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, WHATSAPP_API_TOKEN, N8N_WEBHOOK_SECRET
openssl rand -hex 24            # pegá el resultado en N8N_ENCRYPTION_KEY
docker compose up -d            # n8n en http://localhost:5678
```

Importá y activá el workflow (ver [comandos](#regenerar--re-importar-el-workflow-de-n8n)).
El workflow lee credenciales por `{{ $env.X }}` (pasadas por docker-compose;
requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). El webhook de n8n queda en
`${N8N_BASE_URL}/webhook/whatsapp`.

### 5. Webhook

```bash
pnpm dev:webhook                        # desarrollo (tsx watch, :8080)
pnpm build:webhook && pnpm start:webhook  # producción (node dist/index.js)
```

Endpoints:
- `GET /webhook` — verificación de Meta (responde `hub.challenge`).
- `POST /webhook` — valida HMAC, deduplica, ignora statuses, reenvía a n8n.
- `GET /` — health check.

En local, exponelo con un túnel (ngrok/cloudflared) y poné esa URL pública en la
config del webhook de Meta. **Ojo:** si reiniciás ngrok cambia la URL y hay que
actualizarla en Meta.

### 6. CRM

```bash
pnpm dev:crm                    # http://localhost:3000
```

Login por **magic link** (email vía Supabase Auth). El member ve **Contactos** y
**Métricas** de su tenant; el admin ve **Tenants**, **Estadísticas** y **Logs**.

## Roles y multi-tenancy

- **member**: siempre ligado a un tenant; ve solo lo suyo (RLS
  `tenant_id = current_tenant_id()`).
- **admin**: `tenant_id` null; ve todos los tenants
  (`... or (is_admin() and not is_impersonating())`).
- **Impersonación**: el admin setea una cookie httpOnly `act_as_tenant`; el CRM
  la reenvía como header `x-impersonate-tenant`, que las funciones de RLS honran
  **solo** para admins, acotándolo al tenant impersonado a nivel base de datos
  (no solo por filtro en el server). Ver `supabase/impersonation-rls.sql`.

## Funcionalidades en detalle

- **Flujos de menú**: el árbol vive en `bot_configs.flow_definition` (JSON de
  nodos con `title`, `message`, `options`, y flags `handoff`/`await_query`/`mute`).
  Se edita en Configuración; n8n lo interpreta en el nodo *Menu engine*.
- **Handoff**: columna `contacts.handoff` (dedicada, para evitar el race con
  n8n). El agente responde desde el compositor del chat; resumen IA + labels
  automáticas al derivar.
- **Adjuntos**: enviar imágenes ≤5MB / PDF ≤16MB (validados por magic-numbers);
  recibir imágenes/PDF/audios (n8n los baja de Meta y sube a Storage). Bucket
  privado con RLS por tenant; se firman URLs on-demand.
- **Métricas** (`lib/tenant-metrics.ts`): agregación en JS sobre `messages`,
  `event_logs`, `contacts` y `failed_messages`, con corte por día en timezone AR.

## Migraciones SQL

Orden canónico (detalle en [`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md)):

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `schema.sql` | Snapshot de tablas, índices, realtime. |
| 2 | `policies.sql` | `current_tenant_id()` + RLS por tenant. |
| 3 | `seed.sql` | Tenant demo + bot_config + labels + user demo. |
| 4 | `flows.sql` | `bot_configs.flow_type/flow_definition` + `contacts.flow_state`. |
| 5 | `seed-rq.sql` | Tenant RQ + flujo de menú. |
| 6 | `admin.sql` | `profiles.role` + `is_admin()` + RLS `or is_admin()`. |
| 7 | `users-admin.sql` | `profiles.tenant_id` nullable (admin sin tenant). |
| 8 | `tenant-logo.sql` | `tenants.logo_url`. |
| 9 | `event-logs.sql` | Tabla `event_logs` (log durable) + RLS. |
| 10 | `handoff-column.sql` | `contacts.handoff` + CHECK rol↔tenant. |
| 11 | `impersonation-rls.sql` | `is_impersonating()` + RLS que respeta la impersonación. |
| 12 | `chat-attachments.sql` | `messages.media_*` + bucket privado + Storage RLS. |

> `schema.sql` es un **snapshot** e incluye lo que agregan varios deltas; los
> deltas solo hacen falta para actualizar una base creada antes de cada cambio.

## Regenerar / re-importar el workflow de n8n

El workflow es **generado**; la fuente de verdad es `n8n/build-workflow.mjs`.

```bash
# 1) Regenerar el JSON tras editar el generador
node n8n/build-workflow.mjs

# 2) Re-importar y activar (workflow id: GNhDSHxOMiiLn5k2)
#    (inyectá el id en el JSON para ACTUALIZAR en vez de duplicar)
docker cp n8n/whatsapp-agent-workflow.json n8n-n8n-1:/tmp/wf.json
docker exec n8n-n8n-1 n8n import:workflow --input=/tmp/wf.json
docker exec n8n-n8n-1 n8n update:workflow --id=GNhDSHxOMiiLn5k2 --active=true

# 3) Reiniciar n8n para que tome los cambios
docker restart n8n-n8n-1
```

## Seguridad

- **Sin secretos hardcodeados**: todo por variables de entorno. `.env*`,
  `permanent-token-WA.txt`, `n8n/.env` y `apps/crm/.env.local` están gitignoreados.
- **Service role key** y **token de Meta**: server-only en el CRM (nunca
  `NEXT_PUBLIC`), usados detrás de `isAdmin()`.
- **RLS** en todas las tablas del schema `public` + Storage; la impersonación se
  refleja en RLS.
- **Webhook**: verificación de token + firma HMAC-SHA256 (`WHATSAPP_APP_SECRET`)
  sobre el raw body + dedup por `whatsapp_message_id`.
- **Uploads**: sniff por magic-numbers (no se confía en `file.type`); SVG
  bloqueado (evita XSS almacenado).
- **Ventana de 24h**: solo se responde libre si el último mensaje del cliente es
  < 24h; si no, se loguea en `failed_messages`.

## Deploy

- **CRM → Vercel**: importá `apps/crm`, seteá las env de Supabase + Meta +
  `NEXT_PUBLIC_APP_URL`. En Supabase → Auth → URL Configuration agregá tu dominio
  a **Redirect URLs** (`https://tu-dominio/auth/callback`).
- **Webhook → host Node**: `pnpm build:webhook` + `node apps/webhook/dist/index.js`
  detrás de HTTPS con un dominio estable.
- **n8n → VPS**: el `docker-compose.yml` de `n8n/` detrás de un proxy con TLS.

> **Pendiente antes de producción**: rotar los secretos y moverlos a un secret
> manager; dominio estable en vez de ngrok.

## Referencia rápida (local)

| Servicio | Puerto | Levantar |
|---|---|---|
| CRM (Next.js) | 3000 | `pnpm dev:crm` |
| Webhook (Express) | 8080 | `pnpm dev:webhook` |
| n8n | 5678 | `cd n8n && docker compose up -d` |
| Túnel a Meta | — | `ngrok http 8080` |
