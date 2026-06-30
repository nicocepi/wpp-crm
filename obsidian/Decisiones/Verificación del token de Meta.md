# Verificación del token de Meta

Cómo confirmar que un token de WhatsApp/Meta es válido y permanente, sin enviar un mensaje real.

## Comandos (Graph API v21.0)

**1. ¿El token responde? (válido)**
```
curl -s "https://graph.facebook.com/v21.0/me?fields=id,name&access_token=$TOKEN"
```
Si devuelve `{"id":...,"name":...}` el token sirve. Un token **temporal** dura ~1-2h; si sigue respondiendo días después, es **permanente**.

**2. ¿Tiene los permisos correctos?**
```
curl -s "https://graph.facebook.com/v21.0/me/permissions?access_token=$TOKEN"
```
Deben estar `granted`: `whatsapp_business_messaging` y `whatsapp_business_management`.

**3. ¿Accede al número específico?**
```
curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?fields=id,display_phone_number,verified_name&access_token=$TOKEN"
```
Debe devolver el `display_phone_number` correcto.

## Resultado en este proyecto (2026-06-30)
- Token responde ✅ (permanente, días después de setearlo).
- Permisos `whatsapp_business_messaging` + `whatsapp_business_management` ✅
- Accede a `+54 9 11 7822-5954` (verified_name `Bopi4`, id `1096682600204987`) ✅

## El 401 NO era el token
El token estaba bien. El 401 (code 190, OAuthException) venía de que **n8n tenía cacheado el token viejo** porque `docker compose restart` no re-lee el `.env`. Solución: `--force-recreate`. Ver [[Bitácora/2026-06-30]] y [[Decisiones/Decisiones técnicas]].
