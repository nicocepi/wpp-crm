// Generador del workflow de n8n. Produce un JSON importable y valido.
// Correr: node n8n/build-workflow.mjs  ->  escribe whatsapp-agent-workflow.json
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

let x = 0;
const col = () => (x += 280);
const node = (name, type, typeVersion, parameters, y = 300, extra = {}) => ({
  parameters,
  id: randomUUID(),
  name,
  type,
  typeVersion,
  position: [x, y],
  ...extra,
});

// Headers reutilizables para Supabase REST (service role via env).
const supaHeaders = (extra = []) => ({
  parameters: [
    { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
    { name: "Authorization", value: "=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
    { name: "Content-Type", value: "application/json" },
    ...extra,
  ],
});

const anthropicHeaders = {
  parameters: [
    { name: "x-api-key", value: "={{ $env.ANTHROPIC_API_KEY }}" },
    { name: "anthropic-version", value: "2023-06-01" },
    { name: "content-type", value: "application/json" },
  ],
};

const metaHeaders = {
  parameters: [
    { name: "Authorization", value: "=Bearer {{ $env.WHATSAPP_API_TOKEN }}" },
    { name: "Content-Type", value: "application/json" },
  ],
};

const http = (name, method, url, opts = {}, y = 300) => {
  const params = {
    method,
    url,
    options: opts.options ?? {},
  };
  if (opts.headers) {
    params.sendHeaders = true;
    params.headerParameters = opts.headers;
  }
  if (opts.jsonBody) {
    params.sendBody = true;
    params.specifyBody = "json";
    params.jsonBody = opts.jsonBody;
  }
  return node(name, "n8n-nodes-base.httpRequest", 4.2, params, y, opts.extra ?? {});
};

const code = (name, jsCode, y = 300) =>
  node(name, "n8n-nodes-base.code", 2, { mode: "runOnceForAllItems", jsCode }, y);

const ifBool = (name, expr, y = 300) =>
  node(
    name,
    "n8n-nodes-base.if",
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        combinator: "and",
        conditions: [
          {
            id: randomUUID(),
            leftValue: expr,
            rightValue: "",
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
      },
    },
    y,
  );

const SUPA = "{{ $env.SUPABASE_URL }}/rest/v1";

// ---- Nodos -----------------------------------------------------------------
const nodes = [];
const push = (n) => (nodes.push(n), n);

col();
const webhook = push(
  node(
    "Webhook WhatsApp",
    "n8n-nodes-base.webhook",
    2,
    {
      httpMethod: "POST",
      path: "whatsapp",
      responseMode: "onReceived",
      options: {},
    },
    300,
    { webhookId: randomUUID() },
  ),
);

col();
const secretIf = push(
  node(
    "Secret valido?",
    "n8n-nodes-base.if",
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        combinator: "and",
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $json.headers['x-n8n-secret'] }}",
            rightValue: "={{ $env.N8N_WEBHOOK_SECRET }}",
            operator: { type: "string", operation: "equals" },
          },
        ],
      },
    },
    300,
  ),
);

col();
const ctx = push(
  code(
    "ctx",
    `const body = $input.first().json.body || {};
return [{ json: {
  phone_number_id: body.phone_number_id,
  from: body.from,
  contact_name: body.contact_name || null,
  message_id: body.message_id,
  type: body.type || 'text',
  text: body.text || '',
  timestamp: body.timestamp || new Date().toISOString(),
} }];`,
  ),
);

col();
const resolveTenant = push(
  http(
    "Resolve tenant",
    "GET",
    `=${SUPA}/tenants?whatsapp_phone_id=eq.{{ $('ctx').item.json.phone_number_id }}&select=id`,
    { headers: supaHeaders() },
  ),
);

col();
const prep = push(
  code(
    "prep",
    `const items = $input.all().map(i => i.json);
let tenant = null;
if (items.length === 1 && Array.isArray(items[0])) tenant = items[0][0] || null;
else if (items.length >= 1 && items[0] && items[0].id) tenant = items[0];
else if (items.length === 1 && items[0] && Array.isArray(items[0].body)) tenant = items[0].body[0] || null;
const ctx = $('ctx').first().json;
return [{ json: { ...ctx, tenant_id: tenant ? tenant.id : null, has_tenant: !!tenant } }];`,
  ),
);

col();
const tenantIf = push(ifBool("Tenant existe?", "={{ $json.has_tenant }}"));

col();
const upsertContact = push(
  http(
    "Upsert contact",
    "POST",
    `=${SUPA}/contacts?on_conflict=tenant_id,phone`,
    {
      headers: supaHeaders([
        { name: "Prefer", value: "resolution=merge-duplicates,return=representation" },
      ]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('prep').item.json.tenant_id, phone: $('prep').item.json.from, name: $('prep').item.json.contact_name, last_message_at: $('prep').item.json.timestamp, last_message_preview: $('prep').item.json.text }) }}",
    },
  ),
);

col();
const contactId = push(
  code(
    "contact_id",
    `const items = $input.all().map(i => i.json);
let row = null;
if (items.length === 1 && Array.isArray(items[0])) row = items[0][0] || null;
else if (items[0] && items[0].id) row = items[0];
else if (items[0] && Array.isArray(items[0].body)) row = items[0].body[0] || null;
const p = $('prep').first().json;
return [{ json: { ...p, contact_id: row ? row.id : null, flow_state: row ? row.flow_state : {}, handoff: row ? (row.handoff === true) : false } }];`,
  ),
);

col();
const insertInbound = push(
  http(
    "Insert inbound",
    "POST",
    `=${SUPA}/messages?on_conflict=whatsapp_message_id`,
    {
      headers: supaHeaders([
        { name: "Prefer", value: "resolution=ignore-duplicates,return=minimal" },
      ]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('contact_id').item.json.tenant_id, contact_id: $('contact_id').item.json.contact_id, whatsapp_message_id: $('contact_id').item.json.message_id, direction: 'inbound', content: $('contact_id').item.json.text, message_type: $('contact_id').item.json.type, sent_at: $('contact_id').item.json.timestamp }) }}",
    },
  ),
);

col();
const getBot = push(
  http(
    "Get bot_config",
    "GET",
    `=${SUPA}/bot_configs?tenant_id=eq.{{ $('contact_id').item.json.tenant_id }}&select=enabled,system_prompt,reply_delay_seconds,flow_type,flow_definition`,
    { headers: supaHeaders() },
  ),
);

col();
const getHistory = push(
  http(
    "Get history",
    "GET",
    `=${SUPA}/messages?contact_id=eq.{{ $('contact_id').item.json.contact_id }}&order=sent_at.desc&limit=10&select=direction,content,sent_at`,
    { headers: supaHeaders() },
  ),
);

col();
const prepAI = push(
  code(
    "prep AI",
    `function unwrap(json){ if(Array.isArray(json)) return json; if(json && Array.isArray(json.body)) return json.body; if(json && json.id!==undefined) return [json]; return []; }
const cfgArr = unwrap($('Get bot_config').first().json);
const cfg = cfgArr[0] || { enabled: true, system_prompt: '', reply_delay_seconds: 2 };
const hist = unwrap($('Get history').first().json).slice().reverse();
const c = $('contact_id').first().json;

// Ventana de 24h: solo respuesta libre si el mensaje entrante es < 24h.
const ageMs = Date.now() - new Date(c.timestamp).getTime();
const within24h = ageMs < 24*60*60*1000;
const can_reply = !!cfg.enabled && within24h;

// Construye el array de messages para Claude (alterna user/assistant).
const messages = [];
for (const m of hist) {
  const role = m.direction === 'outbound' ? 'assistant' : 'user';
  if (m.content) messages.push({ role, content: m.content });
}
// Asegura que el ultimo turno sea del user (mensaje actual).
if (messages.length === 0 || messages[messages.length-1].role !== 'user') {
  messages.push({ role: 'user', content: c.text });
}

return [{ json: {
  ...c,
  enabled: !!cfg.enabled,
  system_prompt: cfg.system_prompt || 'Sos un asistente de atencion al cliente. Responde breve y amable en espanol.',
  reply_delay_seconds: cfg.reply_delay_seconds ?? 2,
  within24h, can_reply, messages,
} }];`,
  ),
);

// ----- Branch A: extraer needs ----------------------------------------------
const yA = 140;
col();
const claudeNeeds = push(
  http(
    "Claude extract needs",
    "POST",
    "https://api.anthropic.com/v1/messages",
    {
      headers: anthropicHeaders,
      jsonBody:
        "={{ JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 80, system: [{ type: 'text', text: 'Extrae en UNA frase corta (max 12 palabras) que necesita o pide el contacto. Responde solo la frase, sin comillas.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: $('prep AI').item.json.text }] }) }}",
      extra: { onError: "continueRegularOutput" },
    },
    yA,
  ),
);

col();
const updateNeeds = push(
  http(
    "Update needs",
    "PATCH",
    `=${SUPA}/contacts?id=eq.{{ $('contact_id').item.json.contact_id }}`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ needs: (($json.content && $json.content[0] && $json.content[0].text) || '').trim(), status: 'active' }) }}",
    },
    yA,
  ),
);

// ----- Branch B: respuesta IA -----------------------------------------------
const yB = 460;
x = prepAI.position[0];
col();
const responder = push(ifBool("Responder?", "={{ $('prep AI').item.json.can_reply }}", yB));

col();
const wait = push(
  node(
    "Wait delay",
    "n8n-nodes-base.wait",
    1.1,
    { amount: "={{ $('prep AI').item.json.reply_delay_seconds }}", unit: "seconds" },
    yB,
    { webhookId: randomUUID() },
  ),
);

col();
const claudeReply = push(
  http(
    "Claude reply",
    "POST",
    "https://api.anthropic.com/v1/messages",
    {
      headers: anthropicHeaders,
      jsonBody:
        "={{ JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, system: [{ type: 'text', text: $('prep AI').item.json.system_prompt, cache_control: { type: 'ephemeral' } }], messages: $('prep AI').item.json.messages }) }}",
    },
    yB,
  ),
);

col();
// Send via Meta Graph API. Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
const sendMeta = push(
  http(
    "Send WhatsApp",
    "POST",
    "=https://graph.facebook.com/v21.0/{{ $('prep AI').item.json.phone_number_id }}/messages",
    {
      headers: metaHeaders,
      jsonBody:
        "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('prep AI').item.json.from, type: 'text', text: { body: (($json.content && $json.content[0] && $json.content[0].text) || '').trim() } }) }}",
      extra: { onError: "continueErrorOutput" },
      options: { batching: { batch: { batchSize: 1, batchInterval: 100 } } },
    },
    yB,
  ),
);

col();
const insertOutbound = push(
  http(
    "Insert outbound",
    "POST",
    `=${SUPA}/messages`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('prep AI').item.json.tenant_id, contact_id: $('prep AI').item.json.contact_id, whatsapp_message_id: (($json.messages && $json.messages[0] && $json.messages[0].id) || null), direction: 'outbound', content: (($('Claude reply').item.json.content && $('Claude reply').item.json.content[0] && $('Claude reply').item.json.content[0].text) || '').trim(), message_type: 'text', sent_at: new Date().toISOString() }) }}",
    },
    yB,
  ),
);

// Log de fallos: fuera de ventana / bot off
const logWindow = push(
  http(
    "Log failed (ventana)",
    "POST",
    `=${SUPA}/failed_messages`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('prep AI').item.json.tenant_id, contact_phone: $('prep AI').item.json.from, content: $('prep AI').item.json.text, error: $('prep AI').item.json.enabled ? 'fuera de ventana 24h' : 'bot deshabilitado' }) }}",
    },
    yB + 160,
  ),
);
logWindow.position = [responder.position[0] + 280, yB + 160];

// Log de fallos: error al enviar a Meta
const logSend = push(
  http(
    "Log failed (send)",
    "POST",
    `=${SUPA}/failed_messages`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('prep AI').item.json.tenant_id, contact_phone: $('prep AI').item.json.from, content: 'respuesta IA', error: 'fallo el envio a Meta' }) }}",
    },
    yB + 160,
  ),
);
logSend.position = [sendMeta.position[0] + 280, yB + 160];

// ===== Rama menú guiado (flow_type === 'menu') ==============================
// Se intercala un Code que normaliza el bot_config, un IF que enruta por
// flow_type, y el intérprete del árbol de menús. Modo 'ai' sigue igual.
const yM = 760;

const botCfg = push(
  code(
    "bot cfg",
    `function unwrap(json){ if(Array.isArray(json)) return json; if(json && Array.isArray(json.body)) return json.body; if(json && typeof json === 'object') return [json]; return []; }
const cfgArr = unwrap($('Get bot_config').first().json);
const cfg = cfgArr[0] || {};
const c = $('contact_id').first().json;
return [{ json: { ...c,
  flow_type: cfg.flow_type || 'ai',
  flow_definition: cfg.flow_definition || null,
  enabled: cfg.enabled !== false,
  system_prompt: cfg.system_prompt || '',
  reply_delay_seconds: cfg.reply_delay_seconds ?? 2,
} }];`,
  ),
);
botCfg.position = [2940, yM];

const menuIf = push(
  node(
    "Modo menu?",
    "n8n-nodes-base.if",
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        combinator: "and",
        conditions: [
          {
            id: randomUUID(),
            leftValue: "={{ $json.flow_type }}",
            rightValue: "menu",
            operator: { type: "string", operation: "equals" },
          },
        ],
      },
    },
    yM,
  ),
);
menuIf.position = [3220, yM];

// Intérprete genérico del árbol de menús (secuencial estricto + mute por día).
const menuEngine = push(
  code(
    "Menu engine",
    `const j = $('bot cfg').first().json;
const flow = j.flow_definition || { start: 'root', nodes: {}, invalid_message: 'Opción no válida.' };
const state = (j.flow_state && typeof j.flow_state === 'object') ? j.flow_state : {};
const text = (j.text || '').toString();
const reply_delay_seconds = j.reply_delay_seconds ?? 1;

// Fecha local AR para el mute "resto del día" (auto-resetea al día siguiente).
const todayAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Handoff es COLUMNA dedicada (j.handoff), no flow_state -> n8n nunca la pisa en false.
// Si un humano tomó el chat, el bot queda en silencio hasta que se libere desde el CRM.
if (j.handoff === true) {
  return [{ json: { should_send: false, reply: '', reply_delay_seconds, handoff_triggered: false, summary_triggered: false, new_flow_state: state, patch_body: { flow_state: state } } }];
}

// Muteado hoy -> silencio total, sin tocar el estado.
if (state.muted_date && state.muted_date === todayAR) {
  return [{ json: { should_send: false, reply: '', reply_delay_seconds, handoff_triggered: false, summary_triggered: false, new_flow_state: state, patch_body: { flow_state: state } } }];
}

// Esperando la consulta libre (tras elegir "hablar con un representante"):
// el mensaje actual ES la consulta -> deriva a humano y dispara el resumen.
if (state.awaiting_query === true) {
  const reply = '¡Gracias! Registramos tu consulta. En breve te atenderá un representante.';
  const new_flow_state = { ...state, awaiting_query: false, current_menu: null, consulta: text };
  return [{ json: { should_send: true, reply, reply_delay_seconds, handoff_triggered: true, summary_triggered: true, path: state.path || [], consulta: text, new_flow_state, patch_body: { flow_state: new_flow_state, handoff: true } } }];
}

const nodes = flow.nodes || {};
const m = text.match(/\\d+/);
const num = m ? m[0] : null;
let current = state.current_menu || null;
let reply = '';
let next_menu = current;
let muted_date = null;
let handoff_triggered = false;
let summary_triggered = false;
let awaiting_query = false;
// Recorrido del menú en esta sesión (títulos de los nodos visitados).
let path = Array.isArray(state.path) ? state.path.slice() : [];

if (!current) {
  // Inicio de sesión: bienvenida (ignora lo tipeado). Reinicia el recorrido.
  const startNode = nodes[flow.start] || { message: '' };
  reply = startNode.message || '';
  next_menu = flow.start;
  path = [];
} else {
  const curNode = nodes[current] || { options: {} };
  const opts = curNode.options || {};
  const target = (num !== null && Object.prototype.hasOwnProperty.call(opts, num)) ? opts[num] : null;
  if (!target) {
    // Opción inválida: queda en el mismo menú.
    reply = flow.invalid_message || 'Opción no válida.';
    next_menu = current;
  } else if (target === flow.start) {
    // "Volver a empezar": reinicia el recorrido.
    reply = (nodes[target] && nodes[target].message) || '';
    next_menu = flow.start;
    path = [];
  } else {
    const tNode = nodes[target] || { message: '' };
    reply = tNode.message || '';
    path.push(tNode.title || target);   // registra el paso elegido
    if (tNode.await_query) { awaiting_query = true; next_menu = null; }                  // pide la consulta libre (handoff al próximo mensaje)
    else if (tNode.handoff) { handoff_triggered = true; summary_triggered = true; next_menu = null; }  // derivar a humano (pausa el bot)
    else if (tNode.mute) { muted_date = todayAR; next_menu = null; }
    else if (tNode.options) { next_menu = target; }            // submenú
    else { next_menu = null; summary_triggered = true; }       // terminal de mensaje predefinido -> resume igual
  }
}

const new_flow_state = { current_menu: next_menu, muted_date, awaiting_query, path };
// patch_body: escribe flow_state siempre; setea la columna handoff=true SOLO al dispararlo.
const patch_body = handoff_triggered ? { flow_state: new_flow_state, handoff: true } : { flow_state: new_flow_state };
return [{ json: { should_send: (reply || '').length > 0, reply, reply_delay_seconds, handoff_triggered, summary_triggered, path, new_flow_state, patch_body } }];`,
  ),
);
menuEngine.position = [3500, yM];

// Persiste el estado SIEMPRE (incluso muteado). patch_body escribe flow_state y,
// solo cuando el flujo dispara handoff, tambien la columna handoff=true. Nunca
// escribe handoff=false -> no pisa el "tomar control" del agente en el CRM.
const patchState = push(
  http(
    "Patch flow_state",
    "PATCH",
    `=${SUPA}/contacts?id=eq.{{ $('contact_id').item.json.contact_id }}`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify($('Menu engine').item.json.patch_body) }}",
    },
  ),
);
patchState.position = [3780, yM];

const enviarMenu = push(
  ifBool("Enviar? (menu)", "={{ $('Menu engine').item.json.should_send }}", yM),
);
enviarMenu.position = [4060, yM];

const waitMenu = push(
  node(
    "Wait delay (menu)",
    "n8n-nodes-base.wait",
    1.1,
    { amount: "={{ $('Menu engine').item.json.reply_delay_seconds }}", unit: "seconds" },
    yM,
    { webhookId: randomUUID() },
  ),
);
waitMenu.position = [4340, yM];

const sendMenu = push(
  http(
    "Send WhatsApp (menu)",
    "POST",
    "=https://graph.facebook.com/v21.0/{{ $('contact_id').item.json.phone_number_id }}/messages",
    {
      headers: metaHeaders,
      jsonBody:
        "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('contact_id').item.json.from, type: 'text', text: { body: $('Menu engine').item.json.reply } }) }}",
      // Si Meta rechaza -> salida de error (no insertar outbound fantasma).
      extra: { onError: "continueErrorOutput" },
      options: { batching: { batch: { batchSize: 1, batchInterval: 100 } } },
    },
  ),
);
sendMenu.position = [4620, yM];

const insertOutboundMenu = push(
  http(
    "Insert outbound (menu)",
    "POST",
    `=${SUPA}/messages`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('contact_id').item.json.tenant_id, contact_id: $('contact_id').item.json.contact_id, whatsapp_message_id: (($json.messages && $json.messages[0] && $json.messages[0].id) || null), direction: 'outbound', content: $('Menu engine').item.json.reply, message_type: 'text', sent_at: new Date().toISOString() }) }}",
    },
  ),
);
insertOutboundMenu.position = [4900, yM];

// Fallo de envío en la rama menú -> failed_messages (no se inserta outbound).
const logFailedSendMenu = push(
  http(
    "Log failed (send menu)",
    "POST",
    `=${SUPA}/failed_messages`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('contact_id').item.json.tenant_id, contact_phone: $('contact_id').item.json.from, content: $('Menu engine').item.json.reply, error: 'fallo el envio a Meta (menu)' }) }}",
    },
  ),
);
logFailedSendMenu.position = [5180, yM + 160];

// ----- Sub-rama: resumen IA al derivar a humano (handoff recién disparado) ---
// Cuando un chat pasa a handoff, Claude resume la conversación y lo deja en
// contacts.needs (la "caja de descripción" del CRM) para el agente.
const yH = 1000;

const handoffIf = push(
  ifBool("Resumir?", "={{ $('Menu engine').item.json.summary_triggered }}", yH),
);
handoffIf.position = [3780, yH];

const getHistoryMenu = push(
  http(
    "Get history (menu)",
    "GET",
    `=${SUPA}/messages?contact_id=eq.{{ $('contact_id').item.json.contact_id }}&order=sent_at.desc&limit=15&select=direction,content,sent_at`,
    { headers: supaHeaders() },
  ),
);
getHistoryMenu.position = [4060, yH];

const prepSummary = push(
  code(
    "prep summary",
    `function unwrap(json){ if(Array.isArray(json)) return json; if(json && Array.isArray(json.body)) return json.body; if(json && typeof json === 'object') return [json]; return []; }
const me = $('Menu engine').first().json;
const path = Array.isArray(me.path) ? me.path : [];
const pathStr = path.join(' → ');
const consulta = (me.consulta || '').toString().trim();
// Comentarios en texto libre del contacto (no simples números de opción).
const hist = unwrap($('Get history (menu)').first().json).slice().reverse();
const comments = hist.filter(m => m.direction === 'inbound' && m.content && !/^\\s*\\d+\\s*$/.test(m.content)).map(m => m.content);
const extra = comments.length ? ('\\nMensajes en texto del contacto: ' + comments.join(' | ')) : '';
let convo = 'Pasos del menú que recorrió: ' + (pathStr || '(ninguno)');
if (consulta) convo += '\\nConsulta que escribió: ' + consulta;
convo += extra;
return [{ json: { convo, pathStr, consulta } }];`,
  ),
);
prepSummary.position = [4340, yH];

const claudeSummary = push(
  http(
    "Claude summary",
    "POST",
    "https://api.anthropic.com/v1/messages",
    {
      headers: anthropicHeaders,
      jsonBody:
        "={{ JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 150, system: [{ type: 'text', text: 'Sos asistente de una administración de consorcios. El contacto usó un menú de WhatsApp. A partir de los pasos del menú y, si la hay, la consulta que escribió, devolvé SOLO un JSON válido (sin texto extra ni markdown) con la forma {\\\"urgente\\\": true|false, \\\"resumen\\\": \\\"...\\\"}. El campo resumen: 1 o 2 frases en español de qué consultó o necesita, para que un agente lo retome; priorizá la consulta escrita y mencioná los pasos; sé específico; NO escribas solo que espera ser atendido. El campo urgente: true SOLO si refleja una urgencia real (fuga de gas, inundación, incendio, ascensor con personas atrapadas, falta de un servicio esencial, riesgo a personas o bienes); si no, false.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: $('prep summary').item.json.convo }] }) }}",
      extra: { onError: "continueRegularOutput" },
    },
  ),
);
claudeSummary.position = [4620, yH];

// Parsea el JSON de Claude -> { resumen, urgente }, con fallback determinístico.
const parseResult = push(
  code(
    "parse result",
    `const c = $('Claude summary').first().json;
const raw = ((c.content && c.content[0] && c.content[0].text) || '').trim();
let urgente = false;
let resumen = '';
try {
  const m = raw.match(/\\{[\\s\\S]*\\}/);
  const obj = JSON.parse(m ? m[0] : raw);
  if (typeof obj.urgente === 'boolean') urgente = obj.urgente;
  if (obj.resumen) resumen = String(obj.resumen).trim();
} catch (e) {
  resumen = raw; // si no vino JSON, usar el texto crudo
}
if (!resumen) {
  const ps = $('prep summary').first().json;
  resumen = (ps.consulta ? ('Consulta: ' + ps.consulta + '. ') : '') + 'Pasos: ' + (ps.pathStr || 'sin registrar');
}
return [{ json: { resumen, urgente } }];`,
  ),
);
parseResult.position = [4760, yH];

const updateNeedsMenu = push(
  http(
    "Update needs (menu)",
    "PATCH",
    `=${SUPA}/contacts?id=eq.{{ $('contact_id').item.json.contact_id }}`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ needs: $('parse result').item.json.resumen, status: 'active' }) }}",
    },
  ),
);
updateNeedsMenu.position = [4900, yH];

// La label "Necesita agente" solo aplica si fue handoff (no en terminales predefinidos).
const handoffLabelIf = push(
  ifBool("Handoff?", "={{ $('Menu engine').item.json.handoff_triggered }}", yH),
);
handoffLabelIf.position = [5180, yH];

// Label automática "Necesita agente" al derivar (server-side, confiable).
const getAttnLabel = push(
  http(
    "Get attention label",
    "GET",
    `=${SUPA}/labels?tenant_id=eq.{{ $('contact_id').item.json.tenant_id }}&name=eq.Necesita%20agente&select=id&limit=1`,
    { headers: supaHeaders() },
  ),
);
getAttnLabel.position = [5460, yH];

const attnLabelId = push(
  code(
    "attn label id",
    `function unwrap(json){ if(Array.isArray(json)) return json; if(json && Array.isArray(json.body)) return json.body; if(json && typeof json === 'object') return [json]; return []; }
const rows = unwrap($('Get attention label').first().json);
const label_id = rows[0] && rows[0].id ? rows[0].id : null;
return [{ json: { label_id, contact_id: $('contact_id').first().json.contact_id } }];`,
  ),
);
attnLabelId.position = [5740, yH];

const linkAttnLabel = push(
  http(
    "Link attention label",
    "POST",
    `=${SUPA}/contact_labels?on_conflict=contact_id,label_id`,
    {
      headers: supaHeaders([
        { name: "Prefer", value: "resolution=ignore-duplicates,return=minimal" },
      ]),
      jsonBody:
        "={{ JSON.stringify({ contact_id: $('attn label id').item.json.contact_id, label_id: $('attn label id').item.json.label_id }) }}",
      extra: { onError: "continueRegularOutput" },
    },
  ),
);
linkAttnLabel.position = [6020, yH];

// Si Claude marcó la consulta como urgente -> flag en flow_state + label "Urgente".
const urgentIf = push(
  ifBool("Urgente?", "={{ $('parse result').item.json.urgente }}", yH),
);
urgentIf.position = [6300, yH];

const setUrgentFlag = push(
  http(
    "Set urgent flag",
    "PATCH",
    `=${SUPA}/contacts?id=eq.{{ $('contact_id').item.json.contact_id }}`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ flow_state: Object.assign({}, $('Menu engine').item.json.new_flow_state, { urgent: true }) }) }}",
    },
  ),
);
setUrgentFlag.position = [6580, yH];

const getUrgentLabel = push(
  http(
    "Get urgent label",
    "GET",
    `=${SUPA}/labels?tenant_id=eq.{{ $('contact_id').item.json.tenant_id }}&name=eq.Urgente&select=id&limit=1`,
    { headers: supaHeaders() },
  ),
);
getUrgentLabel.position = [6860, yH];

const urgentLabelId = push(
  code(
    "urgent label id",
    `function unwrap(json){ if(Array.isArray(json)) return json; if(json && Array.isArray(json.body)) return json.body; if(json && typeof json === 'object') return [json]; return []; }
const rows = unwrap($('Get urgent label').first().json);
const label_id = rows[0] && rows[0].id ? rows[0].id : null;
return [{ json: { label_id, contact_id: $('contact_id').first().json.contact_id } }];`,
  ),
);
urgentLabelId.position = [7140, yH];

const linkUrgentLabel = push(
  http(
    "Link urgent label",
    "POST",
    `=${SUPA}/contact_labels?on_conflict=contact_id,label_id`,
    {
      headers: supaHeaders([
        { name: "Prefer", value: "resolution=ignore-duplicates,return=minimal" },
      ]),
      jsonBody:
        "={{ JSON.stringify({ contact_id: $('urgent label id').item.json.contact_id, label_id: $('urgent label id').item.json.label_id }) }}",
      extra: { onError: "continueRegularOutput" },
    },
  ),
);
linkUrgentLabel.position = [7420, yH];

// ===== Logging durable (event_logs) ========================================
// Escribe la decisión del flujo para debug (no bloquea: onError continua).
const logFlowMenu = push(
  http(
    "Log flow (menu)",
    "POST",
    `=${SUPA}/event_logs`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('contact_id').item.json.tenant_id, contact_id: $('contact_id').item.json.contact_id, phone: $('contact_id').item.json.from, source: 'n8n', level: 'info', event: 'menu_decision', message: ($('Menu engine').item.json.reply || '').slice(0, 300), data: { text: $('contact_id').item.json.text, path: $('Menu engine').item.json.path, next_menu: $('Menu engine').item.json.new_flow_state.current_menu, handoff: $('Menu engine').item.json.new_flow_state.handoff, awaiting_query: $('Menu engine').item.json.new_flow_state.awaiting_query, should_send: $('Menu engine').item.json.should_send, handoff_triggered: $('Menu engine').item.json.handoff_triggered, summary_triggered: $('Menu engine').item.json.summary_triggered } }) }}",
      extra: { onError: "continueRegularOutput" },
    },
    1180,
  ),
);
logFlowMenu.position = [3780, 1180];

const logFlowAi = push(
  http(
    "Log flow (ai)",
    "POST",
    `=${SUPA}/event_logs`,
    {
      headers: supaHeaders([{ name: "Prefer", value: "return=minimal" }]),
      jsonBody:
        "={{ JSON.stringify({ tenant_id: $('prep AI').item.json.tenant_id, contact_id: $('prep AI').item.json.contact_id, phone: $('prep AI').item.json.from, source: 'n8n', level: ($('prep AI').item.json.can_reply ? 'info' : 'warn'), event: 'ai_reply', message: ($('prep AI').item.json.text || '').slice(0, 300), data: { text: $('prep AI').item.json.text, within24h: $('prep AI').item.json.within24h, can_reply: $('prep AI').item.json.can_reply, enabled: $('prep AI').item.json.enabled } }) }}",
      extra: { onError: "continueRegularOutput" },
    },
    140,
  ),
);
logFlowAi.position = [3640, -40];

// Sticky note con docs
const sticky = {
  parameters: {
    content:
      "## WhatsApp Agent\\n\\nEnv requeridas (Settings -> Variables o env del contenedor):\\n- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\\n- ANTHROPIC_API_KEY\\n- WHATSAPP_API_TOKEN\\n- N8N_WEBHOOK_SECRET\\n\\nRequiere N8N_BLOCK_ENV_ACCESS_IN_NODE=false para leer $env.\\n\\nDocs Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages",
    height: 320,
    width: 360,
    color: 4,
  },
  id: randomUUID(),
  name: "Notas",
  type: "n8n-nodes-base.stickyNote",
  typeVersion: 1,
  position: [200, 620],
};
nodes.push(sticky);

// ---- Conexiones ------------------------------------------------------------
const c = (from, toMain, outputIndex = 0) => ({
  [from]: {
    main: outputIndex === 0 && !Array.isArray(toMain)
      ? [[{ node: toMain, type: "main", index: 0 }]]
      : toMain,
  },
});

const connections = {};
const connect = (from, to, fromOutput = 0) => {
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
  connections[from].main[fromOutput].push({ node: to, type: "main", index: 0 });
};

connect("Webhook WhatsApp", "Secret valido?");
connect("Secret valido?", "ctx", 0); // output 0 = true
connect("ctx", "Resolve tenant");
connect("Resolve tenant", "prep");
connect("prep", "Tenant existe?");
connect("Tenant existe?", "Upsert contact", 0);
connect("Upsert contact", "contact_id");
connect("contact_id", "Insert inbound");
connect("Insert inbound", "Get bot_config");
// Ruteo por tipo de flujo
connect("Get bot_config", "bot cfg");
connect("bot cfg", "Modo menu?");
connect("Modo menu?", "Menu engine", 0); // true  -> rama menú
connect("Modo menu?", "Get history", 1); // false -> rama IA
connect("Get history", "prep AI");
// Rama menú guiado
connect("Menu engine", "Log flow (menu)"); // log durable de la decision del menu
connect("Menu engine", "Patch flow_state");
connect("Patch flow_state", "Enviar? (menu)");
connect("Enviar? (menu)", "Wait delay (menu)", 0); // true -> enviar
connect("Wait delay (menu)", "Send WhatsApp (menu)");
connect("Send WhatsApp (menu)", "Insert outbound (menu)", 0); // exito -> outbound
connect("Send WhatsApp (menu)", "Log failed (send menu)", 1); // error -> failed_messages
// Sub-rama: resumen IA al cerrar (handoff o terminal de mensaje predefinido)
connect("Menu engine", "Resumir?"); // fan-out desde el engine
connect("Resumir?", "Get history (menu)", 0); // true -> resumir
connect("Get history (menu)", "prep summary");
connect("prep summary", "Claude summary");
connect("Claude summary", "parse result");
connect("parse result", "Update needs (menu)");
// La label "Necesita agente" solo si fue handoff
connect("Update needs (menu)", "Handoff?");
connect("Handoff?", "Get attention label", 0); // true -> aplicar label
connect("Get attention label", "attn label id");
connect("attn label id", "Link attention label");
// Urgencia: si Claude la marcó urgente, flag + label "Urgente"
connect("Link attention label", "Urgente?");
connect("Urgente?", "Set urgent flag", 0); // true
connect("Set urgent flag", "Get urgent label");
connect("Get urgent label", "urgent label id");
connect("urgent label id", "Link urgent label");
// branch A
connect("prep AI", "Claude extract needs");
connect("prep AI", "Log flow (ai)"); // log durable de la decision IA
connect("Claude extract needs", "Update needs");
// branch B
connect("prep AI", "Responder?");
connect("Responder?", "Wait delay", 0); // true
connect("Responder?", "Log failed (ventana)", 1); // false
connect("Wait delay", "Claude reply");
connect("Claude reply", "Send WhatsApp");
connect("Send WhatsApp", "Insert outbound", 0); // success output
connect("Send WhatsApp", "Log failed (send)", 1); // error output

const workflow = {
  name: "WhatsApp Agent",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  meta: { templatecredsSetupCompleted: false },
  tags: [],
};

writeFileSync(
  new URL("./whatsapp-agent-workflow.json", import.meta.url),
  JSON.stringify(workflow, null, 2),
);
console.log(`OK: ${nodes.length} nodos, conexiones para ${Object.keys(connections).length} nodos.`);
