# Handoff a humano (Fase 1)

Permite que un agente humano **tome el control** de un chat: pausa el bot y responde desde el CRM. Es la Fase 1 del problema "hablar con un representante" (la Fase 2, opcional, es Coexistence — ver [[Decisiones/Coexistence (WhatsApp app + Cloud API)]]).

## Cómo funciona
- Estado en `contacts.flow_state.handoff` (boolean).
- Mientras `handoff === true`, el **`Menu engine` de n8n queda en silencio** (no auto-responde, no cambia el estado). Es lo primero que chequea, antes del mute por día.
- Se **activa** de dos formas:
  1. El cliente elige una opción con acción `handoff` en el flujo. En RQ son **ambas** "aguarde, en breve será atendido": opción **1 (proveedor → `aguarde`)** y opción **6 (representante → `aguarde_rep`)**. Las dos marcan el chat como "Necesita agente" y pausan el bot. (Antes la opción 1 usaba `mute` por el día y NO marcaba nada en el CRM; se cambió a `handoff` para que el agente la vea.)
  2. Un agente toca **"Tomar control"** en el panel de conversación del CRM.

## Resumen IA al derivar (caja de descripción)
Cuando un chat **pasa a handoff** (handoff recién disparado, no en cada mensaje posterior), n8n genera un **resumen con Claude** y lo escribe en `contacts.needs` — la "caja de descripción" del CRM — para que el agente retome con contexto.
- El resumen se dispara con **`summary_triggered`**, que es true cuando:
  1. el contacto **deriva a un humano** (handoff: opción 1, o opción 6 tras escribir su consulta), **o**
  2. el contacto **termina en un nodo terminal de mensaje predefinido** (horarios, teléfonos, placeholders). Así queda registro de qué consultó aunque no pida un humano.
- Sub-rama en n8n: `Menu engine` → IF **`Resumir?`** (`summary_triggered`) → `Get history (menu)` → `prep summary` → `Claude summary` → `Update needs (menu)` (PATCH `contacts.needs` + `status='active'`) → IF **`Handoff?`** (`handoff_triggered`) → label.
- **La label "Necesita agente" (+ badge + campanita) solo se aplica en handoff**, no en los terminales predefinidos. El resumen sí se escribe en ambos casos.
- Claude se llama solo al cerrar una sesión (ocasional). El prompt es general (no asume "pidió representante").

### "Hablar con un representante" pide la consulta primero (await_query)
La opción 6 ahora es de **dos tiempos**:
1. Al elegirla, el bot responde **"Explicá brevemente tu consulta. En breve te atenderá un representante."** y queda en estado `awaiting_query` (nodo con `await_query: true`). **Todavía no hace handoff** (sigue escuchando).
2. El **siguiente mensaje** del contacto se toma como la **consulta**: el bot confirma ("¡Gracias! Registramos tu consulta…"), **recién ahí hace handoff** (`handoff_triggered`) y dispara el resumen IA usando el **recorrido + la consulta** (la prioriza).
- La opción **1 (proveedor)** sigue con handoff inmediato ("Aguarde en línea…"), sin pedir consulta.
- El `Menu engine` chequea `awaiting_query` arriba de todo (después de handoff/mute) y captura el texto libre. La consulta viaja a `prep summary` (`me.consulta`) y al fallback determinístico.

### El resumen explica el recorrido del menú (no genérico)
Un resumen tipo "espera ser atendido" no aporta nada sobre el label. Para que sea útil, el resumen describe **los pasos del menú** que recorrió el contacto:
- Cada nodo del flujo tiene un **`title`** (etiqueta legible del paso, ej. `menu_prop` → "Propietario/inquilino", `aguarde_rep` → "Hablar con un representante").
- El `Menu engine` mantiene `flow_state.path` = array de `title` de los nodos visitados en la sesión. Se **reinicia** al empezar (bienvenida) y al "volver a empezar"; la opción inválida no lo toca.
- `prep summary` arma el texto a partir de `path` (`A → B → C`) + cualquier comentario en texto libre del contacto. `Claude summary` lo redacta mencionando los pasos.
- **Fallback determinístico:** si Claude falla, `Update needs` escribe `"Pidió representante. Pasos: A → B → C"` directamente desde `pathStr`.
- Se **libera** con **"Reactivar bot"** en el CRM → **reset completo**: `handoff=false`, `current_menu=null` y `muted_date=null`, así el próximo mensaje del cliente reinicia el bot desde la bienvenida. (Limpiar `muted_date` es importante: si el contacto había quedado muteado por la opción 1 ese día, sin limpiarlo el bot seguiría en silencio aunque se reactive.)

> Distinción con `mute`: la opción **1 (proveedor)** usa `mute` (silencio solo por el día, auto-resetea). La opción **6** usa `handoff` (pausa hasta que un humano lo libere).

## CRM (responder desde el dashboard)
- **Compositor** en `ConversationSheet`: textarea + enviar (Enter envía, Shift+Enter nueva línea).
- **Badge "Necesita agente"** en `ContactCard` cuando `flow_state.handoff`.
- Server actions en `apps/crm/app/(dashboard)/contacts/actions.ts`:
  - `sendAgentMessage(contactId, text)`: envía por **Meta Graph API** (token server-only `WHATSAPP_API_TOKEN` en el CRM) + inserta el outbound en `messages` (RLS por sesión) + actualiza preview del contacto.
  - `setHandoff(contactId, on)`: togglea `flow_state.handoff`.
- Realtime ya existente refleja el mensaje en la conversación y el badge en la grilla.

## Clasificación de urgencia + label "Urgente"
Al derivar a un humano, la IA **clasifica si la consulta es urgente** y, si lo es, aplica la label **"Urgente"** (rojo) además de "Necesita agente".
- El nodo **`Claude summary`** ahora devuelve **JSON** `{ "urgente": true|false, "resumen": "…" }`. `urgente=true` solo ante urgencias reales (fuga de gas, inundación, incendio, ascensor con personas, falta de servicio esencial, riesgo).
- **`parse result`** (Code) parsea ese JSON robustamente (extrae el primer bloque `{…}`; si falla, usa el texto crudo como resumen y `urgente=false`; fallback determinístico para el resumen).
- Rama de urgencia (dentro de `Handoff?` true): `Link attention label` → IF **`Urgente?`** → `Set urgent flag` (PATCH `flow_state.urgent=true`) → `Get urgent label` → `urgent label id` → `Link urgent label`.
- **`flow_state.urgent`** habilita el reflejo **en vivo** en el CRM (la realtime es sobre `contacts`); la label en `contact_labels` lo hace persistente/filtrable.
- Solo aplica en **handoff** (no en terminales predefinidos). "Tomar control" manual marca atención pero **no** urgencia. "Reactivar bot" limpia `urgent` y quita ambas labels.

## Label automática "Necesita agente"
Al derivar, el contacto se marca con la label **"Necesita agente"** (color ámbar) para poder filtrarlo.
- **Server-side (confiable):** n8n la aplica en la sub-rama de handoff (`Update needs` → `Get attention label` → `attn label id` → `Link attention label`, insert idempotente). Así se aplica aunque no haya nadie en el CRM.
- **Live en el CRM:** `ContactsView` detecta la transición a handoff por realtime y agrega la label localmente (optimista) para mostrarla al instante (la suscripción realtime es sobre `contacts`, no sobre `contact_labels`).
- **Manual:** "Tomar control" agrega la label (vía `setHandoff(on)` server-side); "Reactivar bot" la quita.
- La label se crea una vez por tenant (`getAttentionLabelId` la auto-crea si falta).

## Campanita de notificación
Cuando un chat **entra en handoff** (un cliente pide atención), suena una **campanita tierna y suave**.
- Sintetizada con **Web Audio API** (`lib/sound.ts`): dos notas sine "ding-dong" (C6→G5), volumen bajo, envolvente cálida. **Sin archivo externo ni licencias** (uso libre por construcción).
- Suena en la **transición** a handoff detectada por realtime. **No** suena si el propio agente tocó "Tomar control" (se suprime con `suppressChime`).
- Requiere interacción previa del usuario (política de autoplay); el `AudioContext` se reanuda al reproducir.

## Live-update de la descripción (needs)
`ContactCard` ahora sincroniza `needs`/`name` desde props cuando llegan por realtime (ej: el resumen IA), **sin recargar** y sin pisar lo que el usuario esté tipeando (chequea `document.activeElement`).

## Límite a tener en cuenta
Las respuestas del agente están sujetas a la **ventana de 24h** de WhatsApp (mensajes libres). Fuera de ventana, Meta rechaza el envío (se muestra el error en un toast). Reabrir con template = fuera de scope actual.

## Archivos
- `n8n/flows/rq-administracion.json` (nodo `aguarde_rep` con `handoff:true`) + `build-workflow.mjs` (Menu engine).
- `apps/crm/app/(dashboard)/contacts/actions.ts`, `components/contacts/conversation-sheet.tsx`, `components/contacts/contact-card.tsx`, `lib/types.ts` (`readFlowState`/`isHandoff`).
- `apps/crm/.env.local`: `WHATSAPP_API_TOKEN`, `WHATSAPP_GRAPH_VERSION`.
