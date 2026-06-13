import { describe, it, expect } from "vitest"
import { generateKeyPairSync, createPublicKey } from "node:crypto"
import { normalizePublicKeyPem } from "./pem"

/** Génère une vraie clé publique EC P-256 (prime256v1) au format SPKI PEM. */
function realPublicKeyPem(): string {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  return publicKey.export({ type: "spki", format: "pem" }).toString()
}

/** Deux clés sont équivalentes si leur export DER SPKI est identique. */
function sameKey(a: string, b: string): boolean {
  const da = createPublicKey(a).export({ type: "spki", format: "der" })
  const db = createPublicKey(b).export({ type: "spki", format: "der" })
  return Buffer.from(da).equals(Buffer.from(db))
}

describe("normalizePublicKeyPem", () => {
  it("renvoie null sans entrée", () => {
    expect(normalizePublicKeyPem(undefined)).toBeNull()
    expect(normalizePublicKeyPem("")).toBeNull()
    expect(normalizePublicKeyPem("   ")).toBeNull()
  })

  it("conserve une clé déjà bien formée", () => {
    const pem = realPublicKeyPem()
    const out = normalizePublicKeyPem(pem)
    expect(out).not.toBeNull()
    expect(sameKey(out!, pem)).toBe(true)
  })

  it("répare un PEM aplati sur une seule ligne (cas Vercel mobile)", () => {
    const pem = realPublicKeyPem()
    const flattened = pem.replace(/\n/g, "")
    const out = normalizePublicKeyPem(flattened)
    expect(out).not.toBeNull()
    expect(sameKey(out!, pem)).toBe(true)
    // Le PEM servi est de nouveau multi-lignes.
    expect(out!.split("\n").length).toBeGreaterThan(3)
  })

  it("répare un PEM avec des \\n littéraux", () => {
    const pem = realPublicKeyPem()
    const literal = pem.replace(/\n/g, "\\n")
    const out = normalizePublicKeyPem(literal)
    expect(out).not.toBeNull()
    expect(sameKey(out!, pem)).toBe(true)
  })

  it("reconstruit depuis le seul corps base64 (sans en-têtes)", () => {
    const pem = realPublicKeyPem()
    const bodyOnly = pem
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, "")
    const out = normalizePublicKeyPem(bodyOnly)
    expect(out).not.toBeNull()
    expect(sameKey(out!, pem)).toBe(true)
  })
})
