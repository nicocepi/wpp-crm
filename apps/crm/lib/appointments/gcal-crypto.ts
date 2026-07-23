import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de tokens de Google (access_token/refresh_token) en la app,
 * AES-256-GCM. Formato almacenado: base64(iv) + ":" + base64(authTag) + ":" +
 * base64(ciphertext). La clave nunca se loguea ni se expone al frontend.
 */

function getKey(): Buffer {
  const raw = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Falta GCAL_TOKEN_ENCRYPTION_KEY (openssl rand -hex 32)");
  }
  // Acepta hex (64 chars) o base64; debe resultar en 32 bytes (AES-256).
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("GCAL_TOKEN_ENCRYPTION_KEY debe representar 32 bytes (hex de 64 chars o base64)");
  }
  return key;
}

export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de token cifrado inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
