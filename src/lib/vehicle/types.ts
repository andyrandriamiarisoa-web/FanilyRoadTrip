/**
 * Couche `VehicleProvider` — abstraction du compte véhicule (Tesla Fleet API).
 *
 * Deux implémentations respectent ce contrat :
 *  - `mock` (défaut) : véhicules et état de charge simulés, déterministes,
 *    sans aucune clé ni réseau → l'app est démontrable hors-ligne.
 *  - `tesla` (LIVE) : Fleet API réelle, activée uniquement si les variables
 *    d'environnement Tesla sont présentes (jamais bloquant en dev/CI).
 *
 * Règle Tesla respectée : lecture **ponctuelle** de l'état (jamais de polling).
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Véhicule (métadonnées du compte)
// ---------------------------------------------------------------------------

export const VehicleSchema = z.object({
  id: z.string(),
  vin: z.string(),
  displayName: z.string(),
  model: z.string(),
  /** Capacité batterie utile estimée, kWh — sert au modèle de recharge. */
  usableKwh: z.number().positive(),
  /** Puissance de charge crête, kW. */
  maxChargingKw: z.number().positive(),
})
export type Vehicle = z.infer<typeof VehicleSchema>

// ---------------------------------------------------------------------------
// État instantané (lecture ponctuelle)
// ---------------------------------------------------------------------------

export const VehicleConnectivitySchema = z.enum(["online", "asleep", "offline"])
export type VehicleConnectivity = z.infer<typeof VehicleConnectivitySchema>

export const VehicleStateSchema = z.object({
  vehicleId: z.string(),
  /** State of charge, 0–100 %. */
  soc: z.number().min(0).max(100),
  /** Limite de charge programmée, 0–100 %. */
  chargeLimitSoc: z.number().min(0).max(100),
  /** Autonomie estimée restante, km. */
  estimatedRangeKm: z.number().min(0),
  isCharging: z.boolean(),
  connectivity: VehicleConnectivitySchema,
  /** Horodatage ISO de la lecture. */
  readAt: z.string(),
  /** Origine de la donnée — toujours affichée (anti-pattern « faux vérifié »). */
  source: z.enum(["mock", "tesla"]),
})
export type VehicleState = z.infer<typeof VehicleStateSchema>

// ---------------------------------------------------------------------------
// Contrat du provider
// ---------------------------------------------------------------------------

export interface VehicleProvider {
  /** "mock" | "tesla" — exposé pour l'affichage honnête de la source. */
  readonly mode: "mock" | "tesla"
  /** Liste les véhicules du compte connecté. */
  listVehicles(): Promise<Vehicle[]>
  /**
   * Lecture ponctuelle de l'état d'un véhicule. Vérifie la connectivité
   * avant toute requête de données (bonne pratique Fleet API).
   */
  getVehicleState(vehicleId: string): Promise<VehicleState>
}

export class VehicleNotFoundError extends Error {
  constructor(vehicleId: string) {
    super(`Véhicule introuvable : ${vehicleId}`)
    this.name = "VehicleNotFoundError"
  }
}
