# Servicios locales

Cómo levantar todo el stack en local para probar el flujo end-to-end.

## Servicios y puertos

| Servicio | Puerto | Cómo se levanta |
|---|---|---|
| CRM (Next.js) | 3000 | `pnpm --filter crm dev` |
| n8n (Docker) | 5678 | `docker compose up -d` en `n8n/` |
| webhook (Express) | 8080 | `pnpm build:webhook && pnpm start:webhook` |
| ngrok | — | `ngrok http 8080` |

## Orden de arranque
1. **Docker Desktop** abierto.
2. **n8n**: `cd n8n && docker compose up -d`
3. **webhook**: build + start (puerto 8080).
4. **ngrok**: `ngrok http 8080` → copiar la URL `https://...`
5. **CRM**: `pnpm --filter crm dev` → http://localhost:3000

## Webhook en Meta
- URL: `https://<ngrok>.ngrok-free.dev/webhook`
- Verify token: el de `WHATSAPP_VERIFY_TOKEN` (apps/webhook/.env)
- **Campo `messages` suscrito** en la config de Webhooks de Meta (sin esto, Meta verifica el GET pero nunca manda los POST de mensajes). Ver [[Bitácora/2026-06-30]].

## ⚠️ n8n y cambios en .env
`docker compose restart n8n` **NO re-lee `n8n/.env`**. Para que tome variables nuevas (ej: token de WhatsApp) hay que **recrear** el contenedor:
```
docker compose up -d --force-recreate n8n
```
Verificar que tomó la variable:
```
docker exec n8n-n8n-1 printenv WHATSAPP_API_TOKEN
```
Detalle en [[Decisiones/Decisiones técnicas]] y [[Bitácora/2026-06-30]].

## Re-importar el workflow regenerado en n8n
`n8n/build-workflow.mjs` regenera `whatsapp-agent-workflow.json`, pero n8n ya tiene el workflow en su DB (id `GNhDSHxOMiiLn5k2`). Para actualizar **en su lugar** (no duplicar):
1. `node n8n/build-workflow.mjs`
2. Inyectar `id` + `active:true` en una copia y `docker cp` al contenedor.
3. `docker exec n8n-n8n-1 n8n import:workflow --input=/tmp/wf-import.json` (esto lo **desactiva**).
4. `docker exec n8n-n8n-1 n8n update:workflow --id=GNhDSHxOMiiLn5k2 --active=true`
5. `docker compose restart n8n` (para que re-registre el webhook activo).

> Verificar luego: `select id, active from workflow_entity;` en la DB de n8n.

## Diagnóstico de ejecuciones (sin API key de n8n)
La REST API de n8n pide `X-N8N-API-KEY`. Para depurar sin eso, leer directo de su Postgres:
```
docker exec n8n-n8n-db-1 psql -U n8n -d n8n -t -c \
  "select ed.data from execution_data ed where \"executionId\" = <ID>;"
```
El `data` está deduplicado (valores por referencia numérica), pero alcanza para ver qué nodos corrieron y buscar errores/strings.

## Notas del entorno
- `node`/`pnpm` no están en el PATH por defecto del shell no-interactivo (usa `fnm`). En scripts conviene invocar con la ruta completa de node (`/usr/local/bin/node`) o exportar el PATH.
- ngrok ya está instalado y con authtoken configurado.
