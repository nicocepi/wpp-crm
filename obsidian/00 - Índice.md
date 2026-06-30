# CRM WhatsApp — Índice del Vault

Bóveda de trazabilidad del proyecto **CRM WhatsApp multi-tenant**. Cada cambio confirmado se documenta acá.

## Mapa
- [[Proyecto/Estado actual]] — foto del sistema hoy: qué funciona, qué falta.
- [[Proyecto/Arquitectura]] — componentes, flujo end-to-end, stack.
- [[Infraestructura/Servicios locales]] — cómo levantar webhook, CRM, n8n, ngrok.
- [[Infraestructura/Credenciales y config]] — dónde vive cada variable (sin secretos).
- [[Decisiones/Decisiones técnicas]] — el porqué de las elecciones clave.
- [[Decisiones/Flujos de menú por cliente]] — multi-flow: modo IA vs modo menú, modelo de datos e intérprete.
- [[Decisiones/Handoff a humano (Fase 1)]] — derivar el chat a un agente y responder desde el CRM.
- [[Decisiones/Coexistence (WhatsApp app + Cloud API)]] — investigación: mismo número en app + API (Fase 2 opcional).
- [[Decisiones/Roles y vistas de admin]] — roles member/admin, RLS, secciones Tenants y Estadísticas, y repo GitHub.

## Bitácora
Una nota por día con los cambios confirmados de esa jornada.
- [[Bitácora/2026-06-30]]

## Convención
- Las notas se enlazan con `[[wikilinks]]`.
- Solo se documenta lo **confirmado funcionando**, no lo tentativo.
- Secretos reales (tokens, keys) **nunca** se escriben acá: solo se referencia el archivo `.env` donde viven.
