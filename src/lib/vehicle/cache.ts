/**
 * `CachingVehicleProvider` — réduction de coût Fleet API (TTL).
 *
 * La Fleet API Tesla facture **chaque** lecture `vehicle_data` et chaque appel
 * dont le statut < 500 (un sondage à la minute coûte ~10 $/mois/véhicule).
 * Ce décorateur met en cache les lectures (liste + état) pendant une courte
 * fenêtre : quel que soit le nombre de recalculs d'itinéraire, on ne facture
 * qu'**une lecture par véhicule et par fenêtre TTL**.
 *
 * Le `readAt` conservé reflète la vraie heure de lecture → la fraîcheur reste
 * affichée honnêtement à l'utilisateur. Aucun réveil (`wake_up`), aucune
 * relance sur erreur facturable n'est introduit ici.
 */

import type { Vehicle, VehicleProvider, VehicleState } from "./types"

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CachingOptions {
  ttlMs: number
  /** Horloge injectable (tests). */
  now?: () => number
  /** Magasin injectable (défaut : module, partagé entre invocations « chaudes »). */
  store?: Map<string, CacheEntry<unknown>>
}

/** Cache au niveau module : persiste entre invocations serverless « chaudes ». */
const moduleStore = new Map<string, CacheEntry<unknown>>()

export class CachingVehicleProvider implements VehicleProvider {
  readonly mode: "mock" | "tesla"
  private readonly delegate: VehicleProvider
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly store: Map<string, CacheEntry<unknown>>

  constructor(delegate: VehicleProvider, opts: CachingOptions) {
    this.delegate = delegate
    this.mode = delegate.mode
    this.ttlMs = opts.ttlMs
    this.now = opts.now ?? Date.now
    this.store = opts.store ?? moduleStore
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key) as CacheEntry<T> | undefined
    if (hit && hit.expiresAt > this.now()) return hit.value
    const value = await load()
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs })
    return value
  }

  listVehicles(): Promise<Vehicle[]> {
    return this.cached(`${this.mode}:list`, () => this.delegate.listVehicles())
  }

  getVehicleState(vehicleId: string): Promise<VehicleState> {
    return this.cached(`${this.mode}:state:${vehicleId}`, () =>
      this.delegate.getVehicleState(vehicleId),
    )
  }
}
