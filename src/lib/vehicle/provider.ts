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

export function getVehicleProvider(): VehicleProvider {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  const apiBase = process.env.TESLA_FLEET_API_BASE
  const accessToken = process.env.TESLA_ACCESS_TOKEN

  if (isLive && apiBase && accessToken) {
    return new TeslaVehicleProvider({ apiBase, accessToken })
  }
  return new MockVehicleProvider()
}

export { MockVehicleProvider } from "./mock-provider"
export { TeslaVehicleProvider } from "./tesla-provider"
export * from "./types"
