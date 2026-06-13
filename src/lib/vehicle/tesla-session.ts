/**
 * Session Tesla chiffrée — jetons au repos dans un cookie httpOnly.
 *
 * Les jetons (access + refresh) et la base régionale sont sérialisés en JSON,
 * chiffrés en **AES-256-GCM** avec une clé dérivée de `TESLA_TOKEN_SECRET`,
 * puis stockés dans un cookie `httpOnly` + `Secure` + `SameSite=Lax`. Ils ne
 * touchent donc jamais le bundle client.
 *
 * Pourquoi un cookie chiffré plutôt qu'un store serveur : usage perso
 * mono-utilisateur, déploiement serverless sans base de données. Le secret de
 * chiffrement reste côté serveur ; un cookie volé sans le secret est inutile.
 *
 * Serveur uniquement (utilise `node:crypto`).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import {
  refreshAccessToken,
  getTeslaOAuthConfig,
  type TeslaTokenSet,
} from "./tesla-oauth"

export const TESLA_SESSION_COOKIE = "tesla_session"

/** Durée du cookie de session ≈ durée de vie du refresh token Tesla (~3 mois). */
export const TESLA_SESSION_MAX_AGE_SECONDS = 90 * 24 * 3600

/** Fenêtre de validité d'un `state` OAuth signé (15 min). */
const STATE_MAX_AGE_MS = 15 * 60 * 1000

/** Rafraîchit l'access token s'il expire dans moins de cette marge. */
const REFRESH_SKEW_MS = 60_000

export interface TeslaSession extends TeslaTokenSet {
  /** Base régionale Fleet API découverte (`fleet_api_base_url`). */
  baseUrl: string
}

interface SessionCookieParts {
  iv: string
  tag: string
  data: string
}

/** Clé AES 32 octets dérivée du secret (SHA-256 — déterministe, longueur fixe). */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

function getSecret(): string | null {
  return process.env.TESLA_TOKEN_SECRET || null
}

/**
 * `state` OAuth **signé** (HMAC-SHA256), sans cookie. Le state voyage dans
 * l'URL d'autorisation, Tesla nous le renvoie, et on vérifie sa signature au
 * retour. Cela évite la dépendance à un cookie qui ne survit pas toujours au
 * détour cross-site/PWA (iOS), tout en gardant la protection anti-CSRF : un
 * attaquant ne peut pas forger de state valide sans le secret serveur.
 *
 * Format : `<nonce>.<timestamp>.<hmac base64url>`.
 */
export function createSignedState(secret = getSecret()): string | null {
  if (!secret) return null
  const payload = `${randomBytes(12).toString("hex")}.${Date.now()}`
  const sig = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

/** Vérifie un `state` signé : signature constante-temps + fraîcheur. */
export function verifySignedState(
  state: string | null | undefined,
  opts: { secret?: string | null; now?: () => number } = {},
): boolean {
  const secret = opts.secret === undefined ? getSecret() : opts.secret
  if (!secret || !state) return false
  const parts = state.split(".")
  if (parts.length !== 3) return false
  const [nonce, ts, sig] = parts

  const expected = createHmac("sha256", secret).update(`${nonce}.${ts}`).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  const now = opts.now ?? Date.now
  const issued = Number(ts)
  if (!Number.isFinite(issued)) return false
  // Ni trop ancien, ni dans le futur (tolérance d'horloge 1 min).
  if (now() - issued > STATE_MAX_AGE_MS || issued - now() > 60_000) return false
  return true
}

/** Chiffre une session. Renvoie `null` si le secret n'est pas configuré. */
export function encryptSession(session: TeslaSession, secret = getSecret()): string | null {
  if (!secret) return null
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(session), "utf8")
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload: SessionCookieParts = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

/** Déchiffre une session. Renvoie `null` si invalide/altérée (jamais ne jette). */
export function decryptSession(raw: string, secret = getSecret()): TeslaSession | null {
  if (!secret) return null
  try {
    const key = deriveKey(secret)
    const payload = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as SessionCookieParts
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"))
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ])
    const obj = JSON.parse(decrypted.toString("utf8")) as TeslaSession
    if (!obj.accessToken || !obj.baseUrl) return null
    return obj
  } catch {
    return null
  }
}

/** Options de cookie cohérentes (httpOnly, Secure, SameSite=Lax). */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  }
}

/**
 * Garantit un access token frais. Si l'access token expire bientôt, le
 * rafraîchit (rotation du refresh token) et signale `changed=true` pour que
 * l'appelant réécrive le cookie.
 */
export async function ensureFreshSession(
  session: TeslaSession,
  opts: { now?: () => number; fetchImpl?: typeof fetch } = {},
): Promise<{ session: TeslaSession; changed: boolean }> {
  const now = opts.now ?? Date.now
  if (session.expiresAt - REFRESH_SKEW_MS > now()) {
    return { session, changed: false }
  }
  const config = getTeslaOAuthConfig()
  if (!config || !session.refreshToken) {
    // Pas de quoi rafraîchir : on rend la session telle quelle (l'appel
    // échouera honnêtement en 401 plutôt que de masquer le problème).
    return { session, changed: false }
  }
  const refreshed = await refreshAccessToken({
    refreshToken: session.refreshToken,
    clientId: config.clientId,
    fetchImpl: opts.fetchImpl,
  })
  return {
    session: { ...refreshed, baseUrl: session.baseUrl },
    changed: true,
  }
}
