/**
 * Fabrique de `LodgingAvailabilityProvider` (Lot R5) — **serveur uniquement**.
 *
 * Mock par défaut (gratuit, déterministe, hors-ligne). En mode live, on tente
 * un fournisseur **sandbox temps réel** dans l'ordre — LiteAPI sandbox, puis
 * Hotelbeds (env. de test). Tous deux renvoient des **données live** (la
 * mention « sandbox » concerne uniquement l'absence de booking et un quota
 * réduit). Les secrets ne transitent jamais par le client.
 *
 * Amadeus Self-Service est retiré : (1) le portail est **décommissionné le
 * 17 juillet 2026** ; (2) son environnement Test ne renvoyait que des données
 * **statiques cachées** — l'estampiller `sourceStatus: "verified"` était une
 * fausse promesse (anti-pattern #3).
 */

import type { AvailabilityRequest, AvailabilityResult, LodgingAvailabilityProvider } from "./types"
import { MockLodgingAvailabilityProvider } from "./mock"
import { LiteApiLodgingAvailabilityProvider } from "./liteapi"
import { HotelbedsLodgingAvailabilityProvider } from "./hotelbeds"
import { CachingLodgingAvailabilityProvider } from "./cache"

/** TTL du cache de disponibilité (secondes) — défaut 10 min. */
const DEFAULT_AVAILABILITY_TTL_SECONDS = 600

function cacheTtlMs(): number {
  const s = Number(process.env.LODGING_AVAILABILITY_TTL_SECONDS) || DEFAULT_AVAILABILITY_TTL_SECONDS
  return Math.max(0, s) * 1_000
}

export function getLodgingAvailabilityProvider(): LodgingAvailabilityProvider {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  const liteApiKey = process.env.LITEAPI_KEY
  const hotelbedsKey = process.env.HOTELBEDS_API_KEY
  const hotelbedsSecret = process.env.HOTELBEDS_API_SECRET

  if (isLive && liteApiKey) {
    return new CachingLodgingAvailabilityProvider(
      new LiteApiLodgingAvailabilityProvider({ apiKey: liteApiKey }),
      { ttlMs: cacheTtlMs() },
    )
  }
  if (isLive && hotelbedsKey && hotelbedsSecret) {
    const useTestEnv = process.env.HOTELBEDS_USE_TEST_ENV !== "false"
    return new CachingLodgingAvailabilityProvider(
      new HotelbedsLodgingAvailabilityProvider({
        apiKey: hotelbedsKey,
        apiSecret: hotelbedsSecret,
        useTestEnv,
      }),
      { ttlMs: cacheTtlMs() },
    )
  }
  // Mock gratuit et déterministe : pas de cache (préserve les tests).
  return new MockLodgingAvailabilityProvider()
}

/**
 * Recherche avec **repli mock honnête** : si le provider live échoue (quota,
 * panne…), on bascule sur le mock et on l'indique dans `notes`. Garantit qu'une
 * clé manquante ou un quota atteint ne casse jamais l'expérience.
 */
export async function searchAvailabilityWithFallback(
  req: AvailabilityRequest,
): Promise<AvailabilityResult> {
  const provider = getLodgingAvailabilityProvider()
  if (provider.mode === "mock") return provider.search(req)
  try {
    return await provider.search(req)
  } catch (err) {
    const reason = err instanceof Error ? err.message : "erreur inconnue"
    const fallback = await new MockLodgingAvailabilityProvider().search(req)
    return {
      ...fallback,
      notes: [`Source temps réel indisponible (${reason}) — repli sur estimation démo.`, ...fallback.notes],
    }
  }
}
