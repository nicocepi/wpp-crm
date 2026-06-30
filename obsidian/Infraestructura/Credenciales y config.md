# Credenciales y config

> ⚠️ Los valores reales (tokens, keys, secrets) **viven solo en los `.env`**. Acá solo se documenta **qué variable va dónde y para qué**. Nunca pegar secretos en el vault.

## apps/webhook/.env
| Variable | Para qué |
|---|---|
| `WEBHOOK_PORT` | Puerto del Express (8080). |
| `WHATSAPP_VERIFY_TOKEN` | Token que Meta valida en el GET de verificación. |
| `WHATSAPP_APP_SECRET` | App Secret de Meta. Se usa para validar la firma HMAC del POST. |
| `N8N_BASE_URL` | Base de n8n (`http://localhost:5678`). |
| `N8N_WEBHOOK_SECRET` | Secreto compartido; viaja en header `x-n8n-secret` y lo valida el workflow. |

## n8n/.env
| Variable | Para qué |
|---|---|
| `POSTGRES_*` | DB interna de n8n. |
| `N8N_ENCRYPTION_KEY` | Cifrado de credenciales de n8n. |
| `N8N_BASIC_AUTH_*` | Login del panel de n8n. |
| `SUPABASE_URL` | Proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Escritura backend (bypassa RLS). |
| `ANTHROPIC_API_KEY` | Claude API. |
| `WHATSAPP_API_TOKEN` | **Token permanente** de Meta para enviar mensajes (Graph API). |
| `N8N_WEBHOOK_SECRET` | Debe coincidir con el del webhook. |

> El workflow lee estas vars como `{{ $env.X }}`. Requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (seteado en `docker-compose.yml`).

## apps/crm/.env.local
| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente con RLS (sesión del usuario). |
| `WHATSAPP_API_TOKEN` | **Server-only.** Para que el agente responda por la Cloud API desde el CRM (handoff). Mismo token que `n8n/.env`. |
| `WHATSAPP_GRAPH_VERSION` | Versión de Graph API (ej. `v21.0`). |

## Supabase — datos clave del tenant demo
- Proyecto ref: `nimdkfnkvhjzwybalfex`
- Tenant demo `id`: `00000000-0000-0000-0000-0000000000a1` ("Empresa Demo")
- `tenants.whatsapp_phone_id` = `1096682600204987` (número +54 9 11 7822-5954)

## Relación clave: phone_number_id
El `phone_number_id` que **manda Meta en el webhook** debe coincidir **exactamente** con `tenants.whatsapp_phone_id` en Supabase, o el nodo "Resolve tenant" de n8n no encuentra el tenant y el flujo se corta. Ver [[Bitácora/2026-06-30]].
