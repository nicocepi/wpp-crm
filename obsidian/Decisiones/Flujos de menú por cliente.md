# Flujos de menú por cliente (multi-flow)

Cómo el sistema soporta **un flujo distinto por tenant**. Hoy: modo `ai` (Claude libre, el original) y modo `menu` (árbol guiado determinístico, RQ Administración).

## Decisión: data-driven
El flujo se guarda como **JSON en la DB**, no hardcodeado en n8n. Un intérprete genérico en n8n lo recorre. Cliente nuevo = nuevo JSON, sin tocar el workflow.

## Modelo de datos
- `bot_configs.flow_type` — `'ai'` | `'menu'` (default `'ai'`, no rompe tenants existentes).
- `bot_configs.flow_definition` — `jsonb`, el árbol (solo modo menu).
- `contacts.flow_state` — `jsonb`: `{ current_menu: <node_id>|null, muted_date: 'YYYY-MM-DD'|null }`.

DDL en `supabase/flows.sql`; setup de RQ en `supabase/seed-rq.sql`. Columnas aditivas → RLS existente las cubre.

## Estructura del árbol (`flow_definition`)
```
{
  "start": "root",
  "invalid_message": "Opción no válida…",
  "nodes": {
    "root":      { "message": "<bienvenida + 1/2>", "options": { "1": "aguarde", "2": "menu_prop" } },
    "menu_prop": { "message": "…0. Volver a empezar", "options": { "3": "...", "0": "root", ... } },
    "aguarde":   { "message": "Aguarde en línea…", "mute": true },
    "horarios":  { "message": "…" }
  }
}
```
- **Nodo menú** = tiene `options` (mapa `número → node_id`). Incluye `0 → root` ("volver a empezar").
- **Nodo terminal** = sin `options`. Opcional `mute: true`.
- El árbol real de RQ vive en `n8n/flows/rq-administracion.json` (versionado en git).

## Intérprete (`Menu engine`, Code node en n8n)
Reglas (navegación **secuencial estricta**):
1. Si `flow_state.muted_date === hoyAR` ⇒ **silencio total** (no responde, no cambia estado).
2. Sin `current_menu` (sesión nueva / reseteada) ⇒ envía la bienvenida (`nodes[start]`), ignora lo tipeado, `current_menu = start`.
3. Con `current_menu`: parsea el primer entero del texto.
   - Si pertenece a `options` del menú actual ⇒ avanza: `mute` ⇒ setea `muted_date` y `current_menu=null`; terminal ⇒ `current_menu=null` (fin de sesión, el próximo mensaje reinicia); submenú ⇒ `current_menu=target`.
   - Si no ⇒ `invalid_message`, **queda en el mismo menú** (no re-muestra el menú).
4. `Patch flow_state` persiste el estado **siempre** (incluso muteado).

**Mute "resto del día":** se compara `muted_date` contra la fecha local AR
(`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`). Auto-resetea al día siguiente sin cron.

## Ruteo en el workflow
`Get bot_config` (select incluye `flow_type,flow_definition`) → `bot cfg` (normaliza) → IF **`Modo menu?`**:
- `flow_type === 'menu'` ⇒ rama menú (`Menu engine` → `Patch flow_state` → `Enviar? (menu)` → `Wait` → `Send WhatsApp (menu)` → `Insert outbound (menu)`).
- si no ⇒ rama IA original (`Get history` → `prep AI` → Claude…), intacta.

## Gotcha registrado
`unwrap()` original descartaba objetos sin campo `id`; el `bot_config` no tiene `id` (PK = `tenant_id`), así que `bot cfg` debe envolver **cualquier objeto**. Ver [[Bitácora/2026-06-30]].

## Pendiente
- Reemplazar placeholders: opciones 8–11 y teléfonos 12–15 en `rq-administracion.json` (y re-correr el `update` de `flow_definition`).
- UI en el CRM para editar `flow_definition` por tenant (hoy se carga por SQL).
