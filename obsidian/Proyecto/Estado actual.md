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
- **Builds** de ambas apps sin errores TypeScript.

## Tenant RQ Administración
- Modo **menú** (`flow_type='menu'`), árbol cargado desde `n8n/flows/rq-administracion.json`.
- Verificado end-to-end por WhatsApp (bienvenida + navegación). Ejecución n8n 14 OK.
- **Placeholders pendientes de reemplazar:** opciones 8–11 (liquidación, pago, desperfectos, urgencias) y teléfonos 12–15 (ascensores, plomería, gas, electricidad).

## Número de WhatsApp en producción
- Número: **+54 9 11 7822-5954** (verified_name: `Bopi4`)
- `phone_number_id`: **1096682600204987** ← guardado en `tenants.whatsapp_phone_id`
- Token: **permanente**, validado (ver [[Decisiones/Verificación del token de Meta]]).

## Qué falta / pendiente
- Reemplazar placeholders del flujo de RQ (opciones 8–11 y teléfonos 12–15).
- Probar el handoff end-to-end por WhatsApp (opción 6 → agente responde desde el CRM).
- Deploy productivo: CRM a Vercel, webhook a un host Node, n8n a VPS.
- Reemplazar ngrok por un dominio estable para el webhook.
- Templates de mensajes (fuera de ventana 24h) — fuera de scope actual.
- Documentar onboarding de un segundo tenant real.

## Cómo levantar todo localmente
Ver [[Infraestructura/Servicios locales]].
