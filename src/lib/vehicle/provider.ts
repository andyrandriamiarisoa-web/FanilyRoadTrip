/**
 * Fabrique de `VehicleProvider`.
 *
 * Renvoie l'implémentation Tesla LIVE uniquement si l'app est en mode "live"
 * ET que les variables d'environnement Tesla sont présentes. Sinon → MOCK.
 * Aucune validation Tesla ne peut donc bloquer le build ou les tests.
 *
 * Ce module n'est appelé que côté serveur (routes API) : les tokens ne
 * transitent jamais par le client.
 */

import type { VehicleProvider } from "./types"
import { MockVehicleProvider } from "./mock-provider"
import { TeslaVehicleProvider } from "./tesla-provider"
import { CachingVehicleProvider } from "./cache"

/** TTL du cache d'état véhicule (secondes) ; défaut 5 min pour plafonner le coût Fleet API. */
const DEFAULT_STATE_CACHE_TTL_SECONDS = 300

export function getVehicleProvider(): VehicleProvider {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  const apiBase = process.env.TESLA_FLEET_API_BASE
  const accessToken = process.env.TESLA_ACCESS_TOKEN

  if (isLive && apiBase && accessToken) {
    // Cache TTL devant la Fleet API : chaque lecture est facturée, on en
    // limite donc le nombre (au plus une par véhicule et par fenêtre).
    const ttlSec = Number(process.env.TESLA_STATE_CACHE_TTL_SECONDS) || DEFAULT_STATE_CACHE_TTL_SECONDS
    return new CachingVehicleProvider(new TeslaVehicleProvider({ apiBase, accessToken }), {
      ttlMs: Math.max(0, ttlSec) * 1_000,
    })
  }
  // Le mock est gratuit et déterministe : pas de cache (préserve les tests).
  return new MockVehicleProvider()
}

export { MockVehicleProvider } from "./mock-provider"
export { TeslaVehicleProvider } from "./tesla-provider"
export { CachingVehicleProvider } from "./cache"
export * from "./types"
