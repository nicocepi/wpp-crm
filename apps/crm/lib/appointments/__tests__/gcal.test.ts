import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";

const TEST_KEY = "3e6211e8d40743fcbabbef9737a45413f64cfb5a5e3f999b7b78df184ea2818b";

describe("gcal-crypto — cifrado de tokens", () => {
  beforeAll(() => {
    process.env.GCAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  it("encrypt/decrypt es un round-trip exacto", async () => {
    const { encryptToken, decryptToken } = await import("../gcal-crypto");
    const plain = "ya29.a0AfH6SMB_fake_access_token_value";
    const enc = encryptToken(plain);
    expect(enc).not.toContain(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it("cada cifrado usa un IV distinto (ciphertexts distintos para el mismo input)", async () => {
    const { encryptToken } = await import("../gcal-crypto");
    const a = encryptToken("mismo-valor");
    const b = encryptToken("mismo-valor");
    expect(a).not.toBe(b);
  });

  it("falla al descifrar con la clave incorrecta (autenticación GCM)", async () => {
    const { encryptToken, decryptToken } = await import("../gcal-crypto");
    const enc = encryptToken("secreto");
    process.env.GCAL_TOKEN_ENCRYPTION_KEY = "0".repeat(64); // otra clave de 32 bytes
    expect(() => decryptToken(enc)).toThrow();
    process.env.GCAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  it("lanza un error claro si falta la variable de entorno", async () => {
    delete process.env.GCAL_TOKEN_ENCRYPTION_KEY;
    const { encryptToken } = await import("../gcal-crypto");
    expect(() => encryptToken("x")).toThrow(/GCAL_TOKEN_ENCRYPTION_KEY/);
    process.env.GCAL_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });
});

describe("gcal-client — construcción de requests (fetch mockeado, sin red real)", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3001/api/integrations/google/callback";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("buildGoogleAuthUrl incluye client_id, redirect_uri, scope de calendar.events y state", async () => {
    const { buildGoogleAuthUrl } = await import("../gcal-client");
    const url = new URL(buildGoogleAuthUrl("nonce-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3001/api/integrations/google/callback");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("nonce-123");
  });

  it("exchangeCodeForTokens hace POST a Google con grant_type=authorization_code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "s", token_type: "Bearer" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { exchangeCodeForTokens } = await import("../gcal-client");
    const tokens = await exchangeCodeForTokens("the-code");

    expect(tokens.access_token).toBe("at");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code")).toBe("the-code");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("test-client-id");
  });

  it("refreshAccessToken detecta invalid_grant (token revocado)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "invalid_grant" }),
    }) as unknown as typeof fetch;
    const { refreshAccessToken } = await import("../gcal-client");
    await expect(refreshAccessToken("stale-refresh-token")).rejects.toThrow("google_token_revoked");
  });

  it("createCalendarEvent hace POST con extendedProperties.private vinculando el turno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "gcal-event-1" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createCalendarEvent } = await import("../gcal-client");

    const { eventId } = await createCalendarEvent("access-token", "primary", {
      summary: "Turno: Limpieza dental — Ana Pérez",
      startAtIso: "2030-01-15T12:00:00.000Z",
      endAtIso: "2030-01-15T13:00:00.000Z",
      appointmentId: "appt-1",
      tenantId: "tenant-1",
    });

    expect(eventId).toBe("gcal-event-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access-token");
    const body = JSON.parse(init.body as string);
    expect(body.extendedProperties.private.crm_appointment_id).toBe("appt-1");
    expect(body.extendedProperties.private.crm_tenant_id).toBe("tenant-1");
    // No debe incluir datos clínicos: el summary/description son los que pasamos.
    expect(body.summary).toBe("Turno: Limpieza dental — Ana Pérez");
  });

  it("deleteCalendarEvent no lanza error si Google ya no tiene el evento (404/410)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    }) as unknown as typeof fetch;
    const { deleteCalendarEvent } = await import("../gcal-client");
    await expect(
      deleteCalendarEvent("access-token", "primary", "already-gone"),
    ).resolves.toBeUndefined();
  });

  it("deleteCalendarEvent SÍ propaga errores que no son 404/410", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as unknown as typeof fetch;
    const { deleteCalendarEvent } = await import("../gcal-client");
    await expect(deleteCalendarEvent("access-token", "primary", "evt")).rejects.toBeTruthy();
  });
});
