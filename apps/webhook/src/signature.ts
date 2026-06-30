import crypto from "node:crypto";

/**
 * Valida el header X-Hub-Signature-256 de Meta.
 * Formato: "sha256=<hex>" = HMAC-SHA256(appSecret, rawBody).
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 */
export function isValidSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const received = signatureHeader.slice("sha256=".length);

  // Comparacion en tiempo constante (evita timing attacks).
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
