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
    return NextResponse.json({ skipped: "atendida o liberada" });
  }

  const { data: cfg } = await admin
    .from("bot_configs")
    .select("alert_email")
    .eq("tenant_id", contact.tenant_id)
    .maybeSingle();
  const to = (cfg?.alert_email ?? "").trim();
  if (!to) {
    return NextResponse.json({ skipped: "sin casilla configurada" });
  }

  const requestedAt = formatAR(body.requested_at);
  const resumen =
    (contact.needs && contact.needs.trim()) ||
    "Sin resumen — el cliente pidió hablar con un representante.";

  const subject = `⚠️ Pedido de agente sin atender — ${contact.phone}`;
  const text = [
    "Un cliente pidió hablar con un agente y sigue sin atención.",
    "",
    `Teléfono: ${contact.phone}`,
    `Solicitado: ${requestedAt}`,
    `Resumen (IA): ${resumen}`,
    "",
    "Ingresá al CRM para tomar la conversación.",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111">
      <p>Un cliente pidió hablar con un agente y <strong>sigue sin atención</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:2px 8px;color:#666">Teléfono</td><td style="padding:2px 8px"><strong>${contact.phone}</strong></td></tr>
        <tr><td style="padding:2px 8px;color:#666">Solicitado</td><td style="padding:2px 8px">${requestedAt}</td></tr>
        <tr><td style="padding:2px 8px;color:#666;vertical-align:top">Resumen (IA)</td><td style="padding:2px 8px">${resumen}</td></tr>
      </table>
      <p style="color:#666">Ingresá al CRM para tomar la conversación.</p>
    </div>`;

  try {
    await sendEmail({ to, subject, text, html });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fallo el envío" },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
