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
// Commandes véhicule (envoi)
// ---------------------------------------------------------------------------

/**
 * Commandes supportées, volontairement restreintes à un sous-ensemble utile
 * pour un carnet de route (confort + charge). Aucune commande de conduite.
 */
export const VehicleCommandSchema = z.object({
  type: z.enum([
    "wake", // réveille le véhicule (préalable fréquent aux autres commandes)
    "start_climate", // préconditionnement / climatisation ON
    "stop_climate",
    "start_charging",
    "stop_charging",
    "set_charge_limit",
  ]),
  /** Pour `set_charge_limit` : pourcentage cible (50–100). */
  percent: z.number().int().min(50).max(100).optional(),
})
export type VehicleCommand = z.infer<typeof VehicleCommandSchema>

export const CommandResultSchema = z.object({
  ok: z.boolean(),
  /** Message honnête : confirmation, ou raison réelle de l'échec. */
  message: z.string(),
  /**
   * `true` si l'échec vient de l'exigence de **commandes signées** (Vehicle
   * Command Protocol des véhicules 2021+). Affiché honnêtement à l'utilisateur
   * plutôt que masqué (anti-pattern « faux vérifié »).
   */
  requiresSignedCommand: z.boolean(),
})
export type CommandResult = z.infer<typeof CommandResultSchema>

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
  /**
   * Envoie une commande au véhicule. Le résultat est toujours explicite
   * (succès ou raison d'échec), jamais silencieux.
   */
  sendCommand(vehicleId: string, command: VehicleCommand): Promise<CommandResult>
}

export class VehicleNotFoundError extends Error {
  constructor(vehicleId: string) {
    super(`Véhicule introuvable : ${vehicleId}`)
    this.name = "VehicleNotFoundError"
  }
}
