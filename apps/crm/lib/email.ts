import "server-only";
import nodemailer from "nodemailer";

/**
 * Transport SMTP desde variables de entorno (server-only). Reusa el SMTP propio.
 * Requiere: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("Faltan variables SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL; 587/25 = STARTTLS
    auth: { user, pass },
  });
}

export type SendResult = {
  messageId?: string;
  accepted: string[];
  rejected: string[];
  response?: string;
};

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const transport = getTransport();
  const info = await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted as string[]) ?? [],
    rejected: (info.rejected as string[]) ?? [],
    response: info.response,
  };
}
