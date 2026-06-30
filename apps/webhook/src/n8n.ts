import { config } from "./config";
import type { NormalizedEvent } from "./whatsapp";

/**
 * Reenvia un evento normalizado al webhook de n8n.
 * Usa fetch nativo (Node 20+). El header x-n8n-secret lo valida el workflow.
 * No bloquea el ack a Meta: los errores se loguean, no se propagan.
 */
export async function forwardToN8n(event: NormalizedEvent): Promise<void> {
  try {
    const res = await fetch(config.n8n.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n8n-secret": config.n8n.secret,
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      console.error(
        `[n8n] forward fallo status=${res.status} message_id=${event.message_id}`,
      );
    }
  } catch (err) {
    console.error(
      `[n8n] forward error message_id=${event.message_id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
