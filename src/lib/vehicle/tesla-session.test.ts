import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  encryptSession,
  decryptSession,
  ensureFreshSession,
  createSignedState,
  verifySignedState,
  type TeslaSession,
} from "./tesla-session"

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"

function session(overrides: Partial<TeslaSession> = {}): TeslaSession {
  return {
    accessToken: "access-123",
    refreshToken: "refresh-456",
    expiresAt: Date.now() + 3_600_000,
    baseUrl: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
    ...overrides,
  }
}

describe("tesla-session — chiffrement", () => {
  it("chiffre puis déchiffre fidèlement (round-trip)", () => {
    const s = session()
    const cipher = encryptSession(s, SECRET)
    expect(cipher).toBeTypeOf("string")
    const back = decryptSession(cipher!, SECRET)
    expect(back).toEqual(s)
  })

  it("renvoie null sans secret (jamais bloquant)", () => {
    expect(encryptSession(session(), "")).toBeNull()
    expect(decryptSession("whatever", "")).toBeNull()
  })

  it("renvoie null si le chiffré est altéré", () => {
    const cipher = encryptSession(session(), SECRET)!
    const tampered = cipher.slice(0, -4) + "AAAA"
    expect(decryptSession(tampered, SECRET)).toBeNull()
  })

  it("renvoie null avec un mauvais secret", () => {
    const cipher = encryptSession(session(), SECRET)!
    expect(decryptSession(cipher, "un-autre-secret-different-xxxxxxxx")).toBeNull()
  })

  it("renvoie null sur une entrée qui n'est pas une session", () => {
    expect(decryptSession("pas-du-base64-valide!!", SECRET)).toBeNull()
  })
})

describe("tesla-session — state OAuth signé", () => {
  it("un state fraîchement signé est valide", () => {
    const state = createSignedState(SECRET)
    expect(state).toBeTypeOf("string")
    expect(verifySignedState(state, { secret: SECRET })).toBe(true)
  })

  it("rejette un state altéré", () => {
    const state = createSignedState(SECRET)!
    const tampered = state.slice(0, -2) + (state.endsWith("AA") ? "BB" : "AA")
    expect(verifySignedState(tampered, { secret: SECRET })).toBe(false)
  })

  it("rejette un state signé avec un autre secret", () => {
    const state = createSignedState("un-autre-secret-xxxxxxxxxxxxxxxx")!
    expect(verifySignedState(state, { secret: SECRET })).toBe(false)
  })

  it("rejette un state expiré (> 15 min)", () => {
    const state = createSignedState(SECRET)!
    const future = () => Date.now() + 16 * 60 * 1000
    expect(verifySignedState(state, { secret: SECRET, now: future })).toBe(false)
  })

  it("rejette une entrée vide ou malformée", () => {
    expect(verifySignedState(null, { secret: SECRET })).toBe(false)
    expect(verifySignedState("", { secret: SECRET })).toBe(false)
    expect(verifySignedState("a.b", { secret: SECRET })).toBe(false)
  })

  it("renvoie null/false sans secret (jamais bloquant)", () => {
    expect(createSignedState("")).toBeNull()
    expect(verifySignedState("x.y.z", { secret: "" })).toBe(false)
  })
})

describe("tesla-session — rafraîchissement", () => {
  const ORIGINAL = { ...process.env }
  beforeEach(() => {
    process.env = {
      ...ORIGINAL,
      TESLA_CLIENT_ID: "client-id",
      TESLA_CLIENT_SECRET: "client-secret",
      TESLA_REDIRECT_URI: "https://app.example/api/tesla/callback",
    }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL }
  })

  it("ne rafraîchit pas un token encore valide", async () => {
    const s = session({ expiresAt: Date.now() + 3_600_000 })
    let called = false
    const { session: out, changed } = await ensureFreshSession(s, {
      fetchImpl: async () => {
        called = true
        return new Response("{}")
      },
    })
    expect(changed).toBe(false)
    expect(called).toBe(false)
    expect(out).toEqual(s)
  })

  it("rafraîchit un token expiré et conserve la base régionale", async () => {
    const s = session({ expiresAt: Date.now() - 1000 })
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 28800 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch

    const { session: out, changed } = await ensureFreshSession(s, { fetchImpl })
    expect(changed).toBe(true)
    expect(out.accessToken).toBe("new-access")
    expect(out.refreshToken).toBe("new-refresh")
    expect(out.baseUrl).toBe(s.baseUrl)
    expect(out.expiresAt).toBeGreaterThan(Date.now())
  })
})
