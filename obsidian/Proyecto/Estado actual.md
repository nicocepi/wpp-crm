# Estado actual

> Última actualización: 2026-06-30

## Resumen
**El flujo end-to-end funciona completo.** Un mensaje de WhatsApp entrante crea/actualiza el contacto en Supabase, Claude extrae el "need", genera una respuesta y la envía de vuelta al cliente por WhatsApp.

## Qué funciona ✅
- **Webhook** recibe mensajes de Meta, valida firma HMAC y reenvía a n8n.
- **n8n workflow** con **dos modos por tenant** (ver [[Decisiones/Flujos de menú por cliente]]):
  - **Modo IA** (`flow_type='ai'`): resolve tenant → upsert contact → Claude (needs) → Claude (respuesta) → Send WhatsApp.
  - **Modo menú** (`flow_type='menu'`): intérprete de árbol guiado determinístico, navegación secuencial, mute por día. **Activo en RQ Administración.**
- **Send WhatsApp** entrega la respuesta al celular del cliente (token permanente OK).
- **CRM** (Next.js) levanta, auth por magic link, grid de contactos, realtime, settings del bot.
- **Handoff a humano**: opciones 1/6 derivan a agente y pausan el bot; el agente responde desde el CRM (compositor + Tomar control/Reactivar bot). Resumen IA del recorrido + consulta, labels automáticas "Necesita agente" y "Urgente" (clasificada por IA), y campanita. Ver [[Decisiones/Handoff a humano (Fase 1)]].
- **Editor de flujos en el CRM**: settings permite elegir modo (IA/menú) y editar el `flow_definition` (JSON) con validación.
- **Roles member/admin** (probado): el member ve solo Contactos; el admin ve **Tenants** + **Estadísticas** (sin Contactos propios) y edita la config de cada tenant. RLS con `OR is_admin()`. Ver [[Decisiones/Roles y vistas de admin]].
- **ABM de usuarios por tenant** (probado): el admin da de alta/baja y lista usuarios de cada tenant (`/tenants/[id]/usuarios`), con cliente service role server-only detrás de `isAdmin()`.
- **Impersonación** (probado): el admin "ingresa como" un tenant y ve/usa la vista member, con banner para salir (cookie `act_as_tenant`, sin forjar sesión).
- **Logo por tenant**: el admin sube el logo en la config del tenant (Storage `tenant-logos`) y se ve en el sidebar del panel del member. Ver [[Decisiones/Logo por tenant]].
- **Logging/observabilidad**: conversaciones en `messages`, errores en `failed_messages`, y un log durable `event_logs` (n8n escribe decisiones del flujo). Webhook con logs JSON. Sección **Logs** (admin) con filtros. Ver [[Decisiones/Logging y observabilidad]].
- **Repo en GitHub**: https://github.com/nicocepi/wpp-crm (rama main). ⚠️ Los cambios de logo por tenant aún **no están pusheados**.
- **Builds** de ambas apps sin errores TypeScript.

## Usuarios
- `nlopez@cepidesigns.com.ar` → **admin** (su `tenant_id` queda null al correr `users-admin.sql`; hoy aún apunta a RQ).
- `nicolaslopezluna@gmail.com` → **member** de RQ Administración.
- `demo@tuempresa.com` → member de RQ (de pruebas).

## Tenant RQ Administración
- Modo **menú** (`flow_type='menu'`), árbol cargado desde `n8n/flows/rq-administracion.json`.
- Verificado end-to-end por WhatsApp (bienvenida + navegación). Ejecución n8n 14 OK.
- **Placeholders pendientes de reemplazar:** opciones 8–11 (liquidación, pago, desperfectos, urgencias) y teléfonos 12–15 (ascensores, plomería, gas, electricidad).

## Número de WhatsApp en producción
- Número: **+54 9 11 7822-5954** (verified_name: `Bopi4`)
- `phone_number_id`: **1096682600204987** ← guardado en `tenants.whatsapp_phone_id`
- Token: **permanente**, validado (ver [[Decisiones/Verificación del token de Meta]]).

## Qué falta / pendiente
- **Correr `supabase/event-logs.sql`** (tabla `event_logs`). Hasta entonces `/logs` va vacío y los logs de n8n fallan silenciosos.
- Pushear a GitHub los cambios de logo por tenant + logging.
- Reemplazar placeholders del flujo de RQ (opciones 8–11 y teléfonos 12–15).
- Deploy productivo: CRM a Vercel, webhook a un host Node, n8n a VPS.
- Reemplazar ngrok por un dominio estable para el webhook.
- Templates de mensajes (fuera de ventana 24h) — fuera de scope actual.
- Onboarding de nuevos tenants desde la UI (hoy se crean por SQL/REST).

## Cómo levantar todo localmente
Ver [[Infraestructura/Servicios locales]].
