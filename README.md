# WhatsApp CRM (multi-tenant)

CRM de WhatsApp multi-tenant. Cada cliente (tenant) tiene su propio numero de
WhatsApp Business. Los mensajes entrantes llegan por el webhook de Meta → un
servicio Node los valida y reenvia a n8n → n8n persiste contactos/mensajes en
Supabase y responde con Claude. El dashboard Next.js muestra los contactos como
tarjetas con labels, "needs" autollenado por IA, estado y conversacion, en
tiempo real y aislado por tenant con RLS.

```
Meta WhatsApp ──> apps/webhook (Express) ──> n8n ──> Supabase ──> apps/crm (Next.js)
                  verify + HMAC + dedup        │
                                               └──> Claude (respuesta + needs) ──> Meta
```

## Stack

- **CRM**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **DB + Realtime + Auth**: Supabase (Postgres + RLS + Realtime)
- **Webhook**: Node.js + Express
- **Orquestacion**: n8n (Docker)
- **IA**: Claude API (`claude-sonnet-4-6`, con prompt caching)
- **Deploy**: Vercel (CRM) + VPS (webhook + n8n)

## Estructura

```
apps/crm        Dashboard Next.js
apps/webhook    Receptor de webhooks de Meta -> reenvia a n8n
n8n/            Workflow importable + docker-compose
supabase/       schema.sql, policies.sql, seed.sql
docs/META_SETUP.md  Checklist de la app de Meta
```

---

## 1. Requisitos

- Node.js >= 20
- pnpm (`npm install -g pnpm`)
- Docker + Docker Compose (para n8n)
- Cuenta de Supabase, app de Meta WhatsApp, API key de Anthropic

## 2. Supabase (base de datos)

En el **SQL Editor** del proyecto, corre en orden:

1. `supabase/schema.sql` — tablas (incluye `profiles`), indices, realtime.
2. `supabase/policies.sql` — RLS multi-tenant (`current_tenant_id()` + policies).
3. `supabase/seed.sql` — bloques 1-3 (tenant demo, bot_config, labels).

Luego crea el usuario demo:

- Dashboard → **Authentication → Users → Add user** → email `demo@tuempresa.com`.
- Corre el **bloque 4** de `seed.sql` (linkea el usuario al tenant en `profiles`).
- Reemplaza `REEMPLAZAR_PHONE_NUMBER_ID` en `tenants` por tu Phone number ID real.

> El modelo es **1 usuario = 1 tenant** via la tabla `profiles`. El RLS usa el
> helper `current_tenant_id()` para aislar todo por tenant. n8n escribe con la
> **service role key** (bypassea RLS); el dashboard usa la **anon key** + sesion.

Para regenerar los tipos TS tras cambios de schema:

```bash
npx supabase gen types typescript --project-id <REF> --schema public > apps/crm/lib/database.types.ts
```

## 3. Meta WhatsApp

Segui el checklist completo en [`docs/META_SETUP.md`](docs/META_SETUP.md). Resumen:

1. Crea app Business + producto WhatsApp.
2. Anota **Phone number ID**, **App Secret**, **API Token**.
3. Define un **Verify token** propio.
4. Configura el webhook (`https://TU_DOMINIO/webhook`) y suscribi el campo `messages`.

## 4. Variables de entorno

Copia `.env.example` y completa. Hay tres lugares:

- Raiz `.env` (usado por `apps/webhook` como fallback).
- `apps/crm/.env.local` (publicas de Supabase ya precargadas).
- `n8n/.env` (copia de `n8n/.env.example`, para docker-compose).

Variables (agrupadas):

| Servicio | Variable | Donde |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CRM (publicas) |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | n8n (secreta) |
| Meta | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | webhook |
| Meta | `WHATSAPP_API_TOKEN` | n8n |
| Claude | `ANTHROPIC_API_KEY` | n8n |
| n8n | `N8N_WEBHOOK_SECRET` | webhook + n8n |
| n8n | `N8N_BASE_URL` | webhook |

## 5. Levantar n8n

```bash
cd n8n
cp .env.example .env   # completa SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, etc.
openssl rand -hex 24   # pega el resultado en N8N_ENCRYPTION_KEY
docker compose up -d
```

n8n queda en `http://localhost:5678`. Luego:

1. **Importa** el workflow: menu → Import from File → `n8n/whatsapp-agent-workflow.json`.
2. El workflow lee credenciales via `{{ $env.X }}` (ya pasadas por docker-compose;
   requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, ya seteado).
3. **Activa** el workflow. El webhook queda en
   `${N8N_BASE_URL}/webhook/whatsapp`.

## 6. Webhook service

```bash
pnpm install
# .env en la raiz o apps/webhook/.env con:
#   WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, N8N_BASE_URL, N8N_WEBHOOK_SECRET
pnpm dev:webhook        # desarrollo (tsx watch)
pnpm build:webhook && pnpm start:webhook   # produccion
```

Expone:
- `GET /webhook` — verificacion de Meta (responde `hub.challenge`).
- `POST /webhook` — valida firma HMAC, deduplica e ignora statuses, reenvia a n8n.
- `GET /` — health check.

Para exponerlo a Meta en local usa un tunel (ngrok/cloudflared) → la URL publica
va en la config del webhook de Meta.

## 7. CRM (dashboard)

```bash
pnpm dev:crm           # http://localhost:3000
```

Login con magic link (el email lo manda Supabase Auth). Tras entrar ves los
contactos en tiempo real, podes editar nombre/needs/estado/labels y abrir la
conversacion. En **Configuracion** controlas el bot (on/off, instrucciones, delay).

## 8. Deploy

- **CRM → Vercel**: importa `apps/crm`, setea `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (tu dominio). `vercel deploy`.
  En Supabase → Auth → URL Configuration agrega tu dominio a **Redirect URLs**
  (`https://tu-dominio/auth/callback`).
- **Webhook → cualquier host Node**: `pnpm build:webhook` + `node apps/webhook/dist/index.js`
  detras de HTTPS.
- **n8n → VPS**: el `docker-compose.yml` de `n8n/` (ponelo detras de un proxy con TLS).

## Constraints de Meta (ya implementados)

- **Verificacion**: `GET /webhook` responde `hub.challenge` si el token coincide.
- **Firma**: `X-Hub-Signature-256` = HMAC-SHA256(`WHATSAPP_APP_SECRET`, raw body).
- **Ventana de 24h**: el workflow solo manda respuesta libre si el ultimo mensaje
  del cliente es < 24h; si no, loguea en `failed_messages`.
- **Dedup**: por `whatsapp_message_id` (cache en el webhook + UNIQUE en `messages`).
- **Statuses**: se ignoran (solo se procesan `messages`).
- **Rate limit**: 100ms entre envios salientes (batching del nodo Send WhatsApp).

## Template messages (fuera de scope)

Este build solo maneja respuestas libres dentro de la ventana de 24h. Para
mensajes proactivos fuera de esa ventana hay que usar **templates** aprobados por
Meta. Donde agregarlos: un nuevo branch en el workflow de n8n que, en vez del nodo
**Send WhatsApp** con `type: 'text'`, use `type: 'template'` con el `name` y
`language` del template aprobado (ver
https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates).

## Notas

- `claude-sonnet-4-6` con **prompt caching** (`cache_control: ephemeral`) en el
  system prompt para abaratar las llamadas repetidas.
- Cero credenciales hardcodeadas: todo por variables de entorno.
