/**
 * Fabrique de `VehicleProvider`.
 *
 * Deux portes d'entrée :
 *  - `getVehicleProvider()` — synchrone, basée **environnement** (mock par
 *    défaut, ou Tesla via `TESLA_ACCESS_TOKEN` statique). Conservée pour les
 *    tests et l'override dev.
 *  - `getVehicleProviderForRequest()` — *async*, basée sur la **session OAuth**
 *    (cookie chiffré) : c'est le chemin nominal du mode live réel. Rafraîchit
 *    le token si besoin et signale à l'UI quand une connexion est requise.
 *
 * Ce module n'est appelé que côté serveur (routes API) : les tokens ne
 * transitent jamais par le client.
 */

import type { VehicleProvider } from "./types"
import { MockVehicleProvider } from "./mock-provider"
import { TeslaVehicleProvider } from "./tesla-provider"
import { CachingVehicleProvider } from "./cache"
import { decryptSession, ensureFreshSession, type TeslaSession } from "./tesla-session"

/** TTL du cache d'état véhicule (secondes) ; défaut 5 min pour plafonner le coût Fleet API. */
const DEFAULT_STATE_CACHE_TTL_SECONDS = 300

function cacheTtlMs(): number {
  const ttlSec =
    Number(process.env.TESLA_STATE_CACHE_TTL_SECONDS) || DEFAULT_STATE_CACHE_TTL_SECONDS
  return Math.max(0, ttlSec) * 1_000
}

function teslaProvider(apiBase: string, accessToken: string): VehicleProvider {
  // Cache TTL devant la Fleet API : chaque lecture est facturée, on en limite
  // donc le nombre (au plus une par véhicule et par fenêtre).
  return new CachingVehicleProvider(new TeslaVehicleProvider({ apiBase, accessToken }), {
    ttlMs: cacheTtlMs(),
  })
}

export function getVehicleProvider(): VehicleProvider {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  const apiBase = process.env.TESLA_FLEET_API_BASE
  const accessToken = process.env.TESLA_ACCESS_TOKEN

  if (isLive && apiBase && accessToken) {
    return teslaProvider(apiBase, accessToken)
  }
  // Le mock est gratuit et déterministe : pas de cache (préserve les tests).
  return new MockVehicleProvider()
}

/** Résultat de la fabrique request-aware. */
export type RequestProvider =
  | { provider: VehicleProvider; refreshedSession?: TeslaSession }
  | { needsAuth: true }

/**
 * Renvoie le provider adapté à la requête courante.
 *
 * Ordre : mock (hors live) → session OAuth (cookie) → override env → besoin
 * d'authentification. Si la session a été rafraîchie, `refreshedSession` est
 * fourni pour que la route réécrive le cookie chiffré.
 */
export async function getVehicleProviderForRequest(
  rawSessionCookie: string | undefined,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<RequestProvider> {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  if (!isLive) return { provider: new MockVehicleProvider() }

  // 1) Session OAuth chiffrée (chemin nominal).
  const session = rawSessionCookie ? decryptSession(rawSessionCookie) : null
  if (session) {
    const { session: fresh, changed } = await ensureFreshSession(session, {
      fetchImpl: opts.fetchImpl,
    })
    return {
      provider: teslaProvider(fresh.baseUrl, fresh.accessToken),
      refreshedSession: changed ? fresh : undefined,
    }
  }

  // 2) Override environnement (dev) : token statique.
  const apiBase = process.env.TESLA_FLEET_API_BASE
  const accessToken = process.env.TESLA_ACCESS_TOKEN
  if (apiBase && accessToken) {
    return { provider: teslaProvider(apiBase, accessToken) }
  }

  // 3) Live mais non connecté → l'UI doit lancer le flux OAuth.
  return { needsAuth: true }
}

export { MockVehicleProvider } from "./mock-provider"
export { TeslaVehicleProvider } from "./tesla-provider"
export { CachingVehicleProvider } from "./cache"
export * from "./types"
