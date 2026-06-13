/**
 * Implémentation MOCK du `VehicleProvider`.
 *
 * Déterministe : aucune dépendance réseau, état reproductible pour les tests.
 * L'état de charge est dérivé d'une graine fixe par véhicule afin de rester
 * stable d'un appel à l'autre (pas de hasard non maîtrisé), tout en restant
 * réaliste (véhicule prêt au départ, charge programmée à 80 %).
 */

import {
  VehicleNotFoundError,
  type CommandResult,
  type Vehicle,
  type VehicleCommand,
  type VehicleProvider,
  type VehicleState,
} from "./types"

const MOCK_VEHICLES: Vehicle[] = [
  {
    id: "tesla-model-s-raven",
    vin: "5YJSA1E2XKF000000",
    displayName: "Model S Raven",
    model: "Tesla Model S Raven",
    usableKwh: 95,
    maxChargingKw: 250,
  },
]

/** SoC de départ simulé par véhicule (%). Cohérent avec un véhicule chargé. */
const MOCK_SOC: Record<string, number> = {
  "tesla-model-s-raven": 82,
}

/** Autonomie EPA approximative pleine charge (km) pour estimer le range. */
const MOCK_FULL_RANGE_KM: Record<string, number> = {
  "tesla-model-s-raven": 540,
}

export class MockVehicleProvider implements VehicleProvider {
  readonly mode = "mock" as const

  async listVehicles(): Promise<Vehicle[]> {
    return MOCK_VEHICLES.map((v) => ({ ...v }))
  }

  async getVehicleState(vehicleId: string, now: Date = new Date()): Promise<VehicleState> {
    const vehicle = MOCK_VEHICLES.find((v) => v.id === vehicleId)
    if (!vehicle) throw new VehicleNotFoundError(vehicleId)

    const soc = MOCK_SOC[vehicleId] ?? 80
    const fullRange = MOCK_FULL_RANGE_KM[vehicleId] ?? 500
    return {
      vehicleId,
      soc,
      chargeLimitSoc: 80,
      estimatedRangeKm: Math.round((soc / 100) * fullRange),
      isCharging: false,
      connectivity: "online",
      readAt: now.toISOString(),
      source: "mock",
    }
  }

  async sendCommand(vehicleId: string, command: VehicleCommand): Promise<CommandResult> {
    if (!MOCK_VEHICLES.some((v) => v.id === vehicleId)) {
      throw new VehicleNotFoundError(vehicleId)
    }
    // Déterministe : la démo confirme toujours, sans état mutable.
    return {
      ok: true,
      message: `${MOCK_COMMAND_LABEL[command.type]} (simulation).`,
      requiresSignedCommand: false,
    }
  }
}

const MOCK_COMMAND_LABEL: Record<VehicleCommand["type"], string> = {
  wake: "Véhicule réveillé",
  start_climate: "Climatisation démarrée",
  stop_climate: "Climatisation arrêtée",
  start_charging: "Charge démarrée",
  stop_charging: "Charge arrêtée",
  set_charge_limit: "Limite de charge mise à jour",
}
