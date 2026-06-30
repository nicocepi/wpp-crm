# Coexistence (WhatsApp app + Cloud API)

Investigación sobre **WhatsApp Coexistence**: usar el **mismo número** en la **app de WhatsApp Business (celular)** y la **Cloud API** a la vez. Sería la Fase 2 del handoff (que un agente atienda desde su teléfono con el mismo número). Ver [[Decisiones/Handoff a humano (Fase 1)]].

## ¿Viable? Sí, con dos salvedades
1. **Argentina:** la disponibilidad ya es prácticamente global (2026), pero **confirmar en el panel de Meta** antes de comprometerlo (la lista de países cambió varias veces).
2. **Nuestro número ya está en Cloud API** (registrado directo con token permanente). Coexistence está pensado **app → API**; pasar un número API-only a coexistence probablemente exija **re-onboarding** por embedded signup. **A validar con Meta/BSP** porque toca el número productivo.

## Requisitos
- App WhatsApp Business **v2.24.17+**.
- Número **vinculado a una Página de Facebook** desde la app.
- Cuenta de negocio (Business Account).
- Onboarding por **Embedded Signup** → "Connect your existing WhatsApp Business App" → escanear **QR** → sincronizar historial (hasta 6 meses).
- **Abrir la app al menos cada 13 días** o la cuenta se desconecta.

## Limitaciones
- Throughput tope **~5 mensajes/seg** (sobra para RQ).
- No disponible: cuenta oficial verificada (tilde verde), **API de llamadas**, cambiar foto de perfil, migrar entre WABAs, WhatsApp Windows/WearOS.
- En 1:1 se pierden: mensajes temporales, ver una vez, ubicación en vivo; listas de difusión solo-lectura.
- Pricing: mensajes desde la **app gratis**; desde la **API** se cobran (Cloud API).

## Implicancia para nuestra arquitectura
Con coexistence, cuando el agente responde desde el celular, Meta dispara un webhook **`smb_message_echoes`**. O sea, **igual hace falta lógica de handoff en n8n** para pausar el bot y no pisar al humano. Coexistence no reemplaza la Fase 1; solo cambia **dónde escribe el agente**.

## Recomendación
Fase 1 (handoff + responder desde el CRM) ya implementada y sin riesgo sobre el número. Coexistence queda como mejora **opcional** cuando se confirme con Meta la disponibilidad en Argentina y la viabilidad de migrar el número actual.

## Fuentes
- Meta for Developers — Onboard WhatsApp Business app users
- 360dialog — Coexistence (message echoes, requisitos, límites)
- ycloud / msg91 / chakrahq — guías 2025-2026
