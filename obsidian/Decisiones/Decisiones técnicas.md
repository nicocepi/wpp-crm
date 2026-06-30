# Decisiones técnicas

El porqué de las elecciones clave del proyecto.

## Multi-tenant con tabla `profiles`
El schema original activaba RLS pero no vinculaba `auth.users` con `tenants`. **Decisión:** agregar tabla `profiles` (1 user = 1 tenant) + helper `current_tenant_id()`.
- El helper es **SECURITY INVOKER** (no DEFINER): corre como el usuario logueado. Funciona porque `profiles` tiene policy que deja al usuario leer su propia fila. Esto evitó un warning del advisor de Supabase.

## Service role vs anon key
- **n8n escribe con `SUPABASE_SERVICE_ROLE_KEY`** → bypassa RLS. Correcto para backend.
- **CRM usa anon key + sesión** → RLS activo, aislamiento por tenant garantizado.

## Resolución de tenant por phone_number_id
El webhook reenvía el `phone_number_id` que Meta incluye en `metadata`. n8n busca el tenant con `whatsapp_phone_id = phone_number_id`. **Si no coinciden, el flujo se corta en "Resolve tenant".** Es el punto de integración más frágil.

## Dedup en dos capas
- Cache en memoria por `message_id` (TTL ~10 min) en el webhook → Meta reintenta en segundos.
- Constraint UNIQUE en `messages.whatsapp_message_id` → red de seguridad real (n8n hace insert con `resolution=ignore-duplicates`).

## Ventana de 24h
La rama de respuesta solo dispara si el mensaje entrante es **< 24h** (regla de Meta para respuestas libres). Fuera de ventana → se loguea en `failed_messages`. Templates para reabrir conversación: fuera de scope actual.

## n8n no re-lee .env con `restart`
`docker compose restart` reinicia el contenedor con las env vars que ya tenía. Para tomar cambios del `.env` hay que `docker compose up -d --force-recreate n8n`. **Esta fue la causa del 401 persistente** al actualizar el token de WhatsApp. Ver [[Bitácora/2026-06-30]].

## Modelo Claude
`claude-sonnet-4-6` con prompt caching (`cache_control: ephemeral`) en el system prompt.
