import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const TZ = "America/Argentina/Buenos_Aires";

/** Fecha/hora legible en AR (ej: "mié 02/07 14:32"). */
function formatAR(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/**
 * Alerta de handoff sin atender. Lo llama n8n (máquina-a-máquina) pasados los
 * minutos configurados. Re-chequea que la conversación SIGA sin asignar y, si
 * hay casilla configurada, manda el mail. Protegido por HANDOFF_ALERT_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.HANDOFF_ALERT_SECRET;
  if (!secret || req.headers.get("x-alert-secret") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { contact_id?: string; requested_at?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const contactId = body.contact_id;
  if (!contactId) {
    return NextResponse.json({ error: "Falta contact_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts")
    .select("id, tenant_id, phone, handoff, handoff_by, needs")
    .eq("id", contactId)
    .single();
  if (!contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  // Re-check autoritativo: solo alertar si sigue en handoff y SIN asignar.
  if (contact.handoff !== true || contact.handoff_by != null) {
    console.log("[handoff-alert] skipped (atendida/liberada)", {
      contact_id: contactId,
      phone: contact.phone,
    });
    return NextResponse.json({ skipped: "atendida o liberada" });
  }

  const { data: cfg } = await admin
    .from("bot_configs")
    .select("alert_email")
    .eq("tenant_id", contact.tenant_id)
    .maybeSingle();
  const to = (cfg?.alert_email ?? "").trim();
  if (!to) {
    console.log("[handoff-alert] skipped (sin casilla)", {
      contact_id: contactId,
    });
    return NextResponse.json({ skipped: "sin casilla configurada" });
  }

  const requestedAt = formatAR(body.requested_at);
  const resumen =
    (contact.needs && contact.needs.trim()) ||
    "Sin resumen (el cliente pidio hablar con un representante).";

  // Asunto ASCII simple (sin emoji/guion largo) para no gatillar filtros de spam.
  const subject = `Pedido de agente sin atender - ${contact.phone}`;
  const text = [
    "Un cliente pidio hablar con un agente y sigue sin atencion.",
    "",
    `Telefono: ${contact.phone}`,
    `Solicitado: ${requestedAt}`,
    `Resumen (IA): ${resumen}`,
    "",
    "Ingresa al CRM para tomar la conversacion.",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111">
      <p>Un cliente pidio hablar con un agente y <strong>sigue sin atencion</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:2px 8px;color:#666">Telefono</td><td style="padding:2px 8px"><strong>${contact.phone}</strong></td></tr>
        <tr><td style="padding:2px 8px;color:#666">Solicitado</td><td style="padding:2px 8px">${requestedAt}</td></tr>
        <tr><td style="padding:2px 8px;color:#666;vertical-align:top">Resumen (IA)</td><td style="padding:2px 8px">${resumen}</td></tr>
      </table>
      <p style="color:#666">Ingresa al CRM para tomar la conversacion.</p>
    </div>`;

  try {
    const info = await sendEmail({ to, subject, text, html });
    console.log("[handoff-alert] sent", {
      to,
      phone: contact.phone,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    return NextResponse.json({
      sent: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    });
  } catch (e) {
    console.error("[handoff-alert] error SMTP", {
      to,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fallo el envío" },
      { status: 502 },
    );
  }
}
