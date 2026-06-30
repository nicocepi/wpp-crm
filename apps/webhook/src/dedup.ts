/**
 * Dedup en memoria por message_id. Meta reintenta cada webhook (suele duplicar
 * en segundos), asi que un TTL corto alcanza. La red de seguridad real es el
 * constraint UNIQUE (whatsapp_message_id) en la tabla messages (n8n hace upsert).
 */
export class Deduper {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = 10 * 60 * 1000) {}

  /** Devuelve true si el id ya fue visto dentro del TTL (es decir, es duplicado). */
  isDuplicate(id: string): boolean {
    const now = Date.now();
    this.prune(now);
    if (this.seen.has(id)) {
      return true;
    }
    this.seen.set(id, now);
    return false;
  }

  private prune(now: number): void {
    for (const [id, ts] of this.seen) {
      if (now - ts > this.ttlMs) {
        this.seen.delete(id);
      }
    }
  }
}
