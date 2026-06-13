/**
 * Implémentation LIVE du `VehicleProvider` via la Tesla Fleet API.
 *
 * Activée uniquement si `TESLA_FLEET_API_BASE` et `TESLA_ACCESS_TOKEN` sont
 * présents côté serveur. Jamais utilisée en dev/CI (le mock prend le relais),
 * donc la construction de l'app ne dépend d'aucune validation Tesla.
 *
 * Bonnes pratiques Fleet API respectées :
 *  - Scopes OAuth requis : openid, offline_access, vehicle_device_data.
 *  - Le token (`access_token` court / `refresh_token` à usage unique ~3 mois)
 *    est géré côté serveur, jamais exposé au client.
 *  - Lecture **ponctuelle** : on vérifie d'abord l'état de connectivité du
 *    véhicule, puis on lit `charge_state` une seule fois (aucun polling).
 */

import {
  VehicleNotFoundError,
  type Vehicle,
  type VehicleConnectivity,
  type VehicleProvider,
  type VehicleState,
} from "./types"

const MILES_TO_KM = 1.60934

export interface TeslaProviderConfig {
  apiBase: string
  accessToken: string
  /** Estimations d'autonomie/capacité par modèle quand l'API ne les fournit pas. */
  fetchImpl?: typeof fetch
}

interface TeslaVehicleListItem {
  id: number | string
  id_s?: string
  vin: string
  display_name: string
  state?: string
}

export class TeslaVehicleProvider implements VehicleProvider {
  readonly mode = "tesla" as const
  private readonly cfg: TeslaProviderConfig
  private readonly doFetch: typeof fetch

  constructor(cfg: TeslaProviderConfig) {
    this.cfg = cfg
    this.doFetch = cfg.fetchImpl ?? fetch
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.cfg.accessToken}`,
      "Content-Type": "application/json",
    }
  }

  async listVehicles(): Promise<Vehicle[]> {
    const res = await this.doFetch(`${this.cfg.apiBase}/api/1/vehicles`, {
      headers: this.headers(),
    })
    if (!res.ok) throw new Error(`Fleet API /vehicles: ${res.status}`)
    const json = (await res.json()) as { response?: TeslaVehicleListItem[] }
    const list = json.response ?? []
    return list.map((v) => ({
      id: String(v.id_s ?? v.id),
      vin: v.vin,
      displayName: v.display_name || "Tesla",
      model: modelFromVin(v.vin),
      // L'API ne renvoie pas la capacité utile : estimation par modèle.
      usableKwh: usableKwhFromVin(v.vin),
      maxChargingKw: 250,
    }))
  }

  async getVehicleState(vehicleId: string): Promise<VehicleState> {
    // 1) Vérifier la connectivité avant toute requête de données.
    const connectivity = await this.connectivity(vehicleId)
    const readAt = new Date().toISOString()

    if (connectivity !== "online") {
      // Véhicule endormi/hors-ligne : on ne réveille pas (coût + batterie).
      return {
        vehicleId,
        soc: 0,
        chargeLimitSoc: 0,
        estimatedRangeKm: 0,
        isCharging: false,
        connectivity,
        readAt,
        source: "tesla",
      }
    }

    // 2) Lecture ponctuelle de l'état de charge uniquement.
    const res = await this.doFetch(
      `${this.cfg.apiBase}/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=charge_state`,
      { headers: this.headers() },
    )
    if (res.status === 404) throw new VehicleNotFoundError(vehicleId)
    if (!res.ok) throw new Error(`Fleet API /vehicle_data: ${res.status}`)

    const json = (await res.json()) as {
      response?: {
        charge_state?: {
          battery_level?: number
          charge_limit_soc?: number
          est_battery_range?: number
          battery_range?: number
          charging_state?: string
        }
      }
    }
    const cs = json.response?.charge_state ?? {}
    const rangeMiles = cs.est_battery_range ?? cs.battery_range ?? 0

    return {
      vehicleId,
      soc: clampPct(cs.battery_level ?? 0),
      chargeLimitSoc: clampPct(cs.charge_limit_soc ?? 80),
      estimatedRangeKm: Math.round(rangeMiles * MILES_TO_KM),
      isCharging: cs.charging_state === "Charging",
      connectivity: "online",
      readAt,
      source: "tesla",
    }
  }

  private async connectivity(vehicleId: string): Promise<VehicleConnectivity> {
    const res = await this.doFetch(
      `${this.cfg.apiBase}/api/1/vehicles/${vehicleId}`,
      { headers: this.headers() },
    )
    if (res.status === 404) throw new VehicleNotFoundError(vehicleId)
    if (!res.ok) throw new Error(`Fleet API /vehicles/{id}: ${res.status}`)
    const json = (await res.json()) as { response?: { state?: string } }
    const state = json.response?.state
    if (state === "online") return "online"
    if (state === "asleep") return "asleep"
    return "offline"
  }
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

// VIN position 4 ('S' = Model S). Heuristique légère, suffisante pour l'affichage.
function modelFromVin(vin: string): string {
  const code = vin.charAt(3).toUpperCase()
  switch (code) {
    case "S":
      return "Tesla Model S"
    case "3":
      return "Tesla Model 3"
    case "X":
      return "Tesla Model X"
    case "Y":
      return "Tesla Model Y"
    default:
      return "Tesla"
  }
}

function usableKwhFromVin(vin: string): number {
  return modelFromVin(vin) === "Tesla Model S" ? 95 : 75
}
