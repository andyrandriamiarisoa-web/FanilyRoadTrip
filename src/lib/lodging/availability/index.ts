/**
 * Fabrique de `LodgingAvailabilityProvider` (Lot R5) — **serveur uniquement**.
 *
 * Mock par défaut (gratuit, déterministe, hors-ligne). En mode live, Amadeus
 * Self-Service si les identifiants sont posés, derrière un cache TTL pour
 * préserver le quota gratuit. Les secrets ne transitent jamais par le client.
 */

import type { AvailabilityRequest, AvailabilityResult, LodgingAvailabilityProvider } from "./types"
import { MockLodgingAvailabilityProvider } from "./mock"
import { AmadeusLodgingAvailabilityProvider } from "./amadeus"
import { CachingLodgingAvailabilityProvider } from "./cache"

/** TTL du cache de disponibilité (secondes) — défaut 10 min. */
const DEFAULT_AVAILABILITY_TTL_SECONDS = 600

function cacheTtlMs(): number {
  const s = Number(process.env.LODGING_AVAILABILITY_TTL_SECONDS) || DEFAULT_AVAILABILITY_TTL_SECONDS
  return Math.max(0, s) * 1_000
}

export function getLodgingAvailabilityProvider(): LodgingAvailabilityProvider {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  const clientId = process.env.AMADEUS_CLIENT_ID
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET

  if (isLive && clientId && clientSecret) {
    return new CachingLodgingAvailabilityProvider(
      new AmadeusLodgingAvailabilityProvider({ clientId, clientSecret }),
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
