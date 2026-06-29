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

import type {
  CommandResult,
  Vehicle,
  VehicleCommand,
  VehicleProvider,
  VehicleState,
} from "./types"

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

  async getVehicleState(vehicleId: string): Promise<VehicleState> {
    const key = `${this.mode}:state:${vehicleId}`
    const hit = this.store.get(key) as CacheEntry<VehicleState> | undefined
    if (hit && hit.expiresAt > this.now()) return hit.value
    const value = await this.delegate.getVehicleState(vehicleId)
    // On ne met en cache que l'état **en ligne** (la donnée facturable de
    // valeur : SoC, autonomie). Un état « en veille / hors-ligne » est
    // transitoire et ne contient pas de SoC réel : le cacher bloquerait le
    // sondage après un réveil (`wake`) pendant tout le TTL. On le laisse donc
    // re-vérifiable immédiatement (la vérification de connectivité seule, sans
    // lecture `vehicle_data` facturable).
    if (value.connectivity === "online") {
      this.store.set(key, { value, expiresAt: this.now() + this.ttlMs })
    }
    return value
  }

  async sendCommand(vehicleId: string, command: VehicleCommand): Promise<CommandResult> {
    // Une commande n'est jamais mise en cache. En cas de succès, l'état change :
    // on invalide l'entrée d'état pour ne pas servir une lecture périmée.
    const result = await this.delegate.sendCommand(vehicleId, command)
    if (result.ok) this.store.delete(`${this.mode}:state:${vehicleId}`)
    return result
  }
}
