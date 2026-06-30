# Arquitectura

CRM de WhatsApp **multi-tenant**: cada cliente (tenant) tiene su propio número de WhatsApp Business. Los mensajes entrantes se persisten como contactos/mensajes y un agente de IA (Claude) responde automáticamente.

## Flujo end-to-end

```
WhatsApp (cliente)
   │  mensaje entrante
   ▼
Meta WhatsApp Cloud API
   │  POST webhook (firmado HMAC-SHA256)
   ▼
apps/webhook  (Express + TS, puerto 8080)
   │  valida firma · dedup · normaliza
   │  POST {N8N_BASE_URL}/webhook/whatsapp  (header x-n8n-secret)
   ▼
n8n  (Docker, puerto 5678)  — workflow "WhatsApp Agent"
   │  1. Secret válido?
   │  2. Resolve tenant  (por whatsapp_phone_id)
   │  3. Upsert contact + Insert inbound message
   │  4. Get bot_config + Get history
   │  5a. RAMA CRM Sync  → Claude extrae "needs" → update contacts
   │  5b. RAMA AI Response → si bot enabled + dentro de 24h →
   │       Claude genera respuesta → Send WhatsApp (Graph API) → Insert outbound
   ▼
Supabase (Postgres + Realtime + Auth + RLS)
   │  realtime push
   ▼
apps/crm  (Next.js 14, puerto 3000)  — dashboard
```

## Componentes

### apps/webhook — Express + TypeScript
Recibe los webhooks de Meta, valida la firma `X-Hub-Signature-256` (HMAC-SHA256 con el App Secret), deduplica por `message_id` (cache en memoria con TTL) y reenvía el evento normalizado a n8n. Responde 200 rápido a Meta.
- `GET /webhook` → verificación (hub.challenge).
- `POST /webhook` → procesa mensajes, ignora statuses.

### n8n — workflow "WhatsApp Agent"
Orquesta la lógica. Lee `$env.*` (requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). Escribe en Supabase con el **service role key** (bypassa RLS, correcto para backend). Dos ramas desde `prep AI`: CRM Sync (needs) y AI Response (respuesta + envío).

### apps/crm — Next.js 14 App Router
Dashboard multi-tenant. Auth por **magic link** (`@supabase/ssr`). Grid de contactos tipo tarjetas con labels, status, needs editable inline. Conversación en un `Sheet`. **Realtime** sobre `contacts` y `messages`. Settings del bot (`bot_configs`). Usa **anon key + sesión** → RLS activo, aislamiento por tenant.

### Supabase
8 tablas: `tenants`, `profiles`, `contacts`, `messages`, `labels`, `contact_labels`, `bot_configs`, `failed_messages`. RLS en todas. Helper `current_tenant_id()` (SECURITY INVOKER) resuelve el tenant del usuario logueado vía `profiles`.

## Stack
Next.js 14 + TS + Tailwind + shadcn/ui · Supabase · Meta WhatsApp Cloud API · n8n (Docker) · Claude API (`claude-sonnet-4-6`) · Vercel + VPS (deploy futuro).

Ver también [[Decisiones/Decisiones técnicas]] y [[Proyecto/Estado actual]].
