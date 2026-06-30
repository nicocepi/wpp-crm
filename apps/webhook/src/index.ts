import express, { type Request, type Response } from "express";
import { config } from "./config";
import { isValidSignature } from "./signature";
import { Deduper } from "./dedup";
import { normalizeIncoming, type MetaWebhookBody } from "./whatsapp";
import { forwardToN8n } from "./n8n";

const app = express();
const deduper = new Deduper();

// Captura el raw body (necesario para validar la firma HMAC) y a la vez parsea JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// Health check.
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "whatsapp-webhook" });
});

// ---- GET /webhook : verificacion de Meta -----------------------------------
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

// ---- POST /webhook : mensajes entrantes ------------------------------------
app.post("/webhook", (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.header("x-hub-signature-256");

  if (!rawBody || !isValidSignature(rawBody, signature, config.appSecret)) {
    console.warn("[webhook] firma invalida -> 403");
    res.sendStatus(403);
    return;
  }

  // Ack rapido a Meta ANTES de procesar (Meta exige respuesta veloz).
  res.sendStatus(200);

  const body = req.body as MetaWebhookBody;
  const events = normalizeIncoming(body);

  for (const event of events) {
    if (deduper.isDuplicate(event.message_id)) {
      console.log(`[webhook] duplicado ignorado message_id=${event.message_id}`);
      continue;
    }
    console.log(
      `[webhook] ${event.type} de ${event.from} (phone_number_id=${event.phone_number_id}) -> n8n`,
    );
    // Fire-and-forget: no bloquea el ack ya enviado.
    void forwardToN8n(event);
  }
});

app.listen(config.port, () => {
  console.log(`[webhook] escuchando en puerto ${config.port}`);
});
