# Checklist — Setup de la App de Meta (WhatsApp Cloud API)

Segui estos pasos antes de probar el flujo end-to-end. No hardcodees ningun valor:
todo va al `.env`.

## 1. Crear la app y el producto WhatsApp
- [ ] Entra a https://developers.facebook.com/apps → **Create App** → tipo **Business**.
- [ ] En el panel de la app → **Add product** → **WhatsApp** → Set up.
- [ ] Meta te da un **numero de prueba** y un **Phone number ID** (lo vas a usar como
      `whatsapp_phone_id` del tenant). Anotalo.

## 2. Identificadores y tokens
- [ ] **Phone number ID** → va al tenant en Supabase (`tenants.whatsapp_phone_id`)
      y al payload del webhook (lo manda Meta automaticamente).
- [ ] **WhatsApp Business Account ID (WABA ID)** → anotalo (lo vas a necesitar para
      templates mas adelante; fuera de scope de este build).
- [ ] **Token de acceso**:
      - Para pruebas: el token temporal (24 h) que muestra la consola.
      - Para produccion: genera un **System User token** permanente
        (Business Settings → Users → System Users → permiso `whatsapp_business_messaging`).
      → va a `WHATSAPP_API_TOKEN`.
- [ ] **App Secret** (Settings → Basic → App Secret) → va a `WHATSAPP_APP_SECRET`
      (se usa para validar la firma `X-Hub-Signature-256` de cada webhook).

## 3. Configurar el Webhook
> El servicio `apps/webhook` debe estar accesible por HTTPS publico.
> Para probar local usa un tunel (ngrok / cloudflared) apuntando al puerto del webhook.

- [ ] Defini un token de verificacion propio (string a tu gusto) → `WHATSAPP_VERIFY_TOKEN`.
- [ ] En la app de Meta → **WhatsApp → Configuration → Webhook → Edit**:
      - **Callback URL**: `https://TU_DOMINIO/webhook`
      - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
      - Meta hace un `GET /webhook` y espera que devuelvas el `hub.challenge`
        (ya implementado en el servicio).
- [ ] En **Webhook fields** → suscribi el campo **`messages`**.
      (Los `statuses` de delivered/read/sent los ignora el servicio.)

## 4. Probar el envio
- [ ] En **WhatsApp → API Setup**, agrega tu numero personal como **destinatario de prueba**.
- [ ] Manda un mensaje desde tu WhatsApp al numero de prueba → deberia entrar por el webhook.

## 5. Datos que vas a cargar en el `.env`
| Variable | De donde sale |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | String inventado por vos (el mismo en Meta y en el `.env`) |
| `WHATSAPP_APP_SECRET` | Settings → Basic → App Secret |
| `WHATSAPP_API_TOKEN` | Token temporal o System User token permanente |
| `whatsapp_phone_id` (Supabase) | WhatsApp → API Setup → Phone number ID |

## Notas
- **Ventana de 24 h**: solo se pueden mandar mensajes de forma libre si el cliente
  escribio en las ultimas 24 h. Fuera de esa ventana hay que usar **templates**
  (fuera de scope de este build — ver README, seccion "Template messages").
- **Rate limits (Tier 1)**: el workflow de n8n agrega 100 ms entre llamadas salientes.
- Docs oficiales: https://developers.facebook.com/docs/whatsapp/cloud-api
