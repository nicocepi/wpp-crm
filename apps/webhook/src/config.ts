import dotenv from "dotenv";
import path from "node:path";

// Resuelve el .env relativo al directorio del archivo, no al cwd.
// Permite correr el servicio desde cualquier directorio (monorepo root o la subcarpeta).
const dir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(dir, ".env") });
dotenv.config({ path: path.join(dir, "..", "..", ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.WEBHOOK_PORT ?? 8080),
  verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
  appSecret: required("WHATSAPP_APP_SECRET"),
  n8n: {
    // Endpoint del webhook de n8n (path "whatsapp" definido en el workflow).
    url: `${required("N8N_BASE_URL").replace(/\/$/, "")}/webhook/whatsapp`,
    secret: required("N8N_WEBHOOK_SECRET"),
  },
} as const;
