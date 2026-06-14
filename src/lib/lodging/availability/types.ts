/**
 * Adaptateur **disponibilité hôtels** (Lot R5) — donnée *temps réel* (dispo +
 * prix) derrière une interface unique, sur le patron de `VehicleProvider`.
 *
 * Règles impératives (cf. handoff §7.2) :
 *  - **Read-only strict** : uniquement recherche/tarifs, jamais de réservation.
 *  - **Classer sans exclure** (anti-pattern #1) : on renvoie toutes les offres,
 *    triées ; on **signale** les indisponibilités, on ne les supprime pas.
 *  - **Source affichée** (anti-pattern #3) : `sourceStatus` + nom du provider +
 *    `readAt` (fraîcheur).
 *  - **Mock-first** : tout est démontrable sans clé.
 */

import { z } from "zod"
import type { SourceStatus } from "@/lib/providers/types"

export const AvailabilityRequestSchema = z.object({
  city: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9).default(2),
  children: z.number().int().min(0).max(9).default(0),
})
export type AvailabilityRequest = z.infer<typeof AvailabilityRequestSchema>

export interface HotelAmenities {
  ac?: boolean
  wifi?: boolean
  parking?: boolean
  breakfast?: boolean
}

export interface HotelOffer {
  id: string
  name: string
  lat?: number
  lng?: number
  address?: string
  available: boolean
  /** Prix total du séjour en **centimes** (EUR), ou null si indisponible. */
  priceTotalCents: number | null
  nights: number
  currency: "EUR"
  rating?: number
  amenities?: HotelAmenities
  sourceStatus: SourceStatus
  /** Nom de la source temps réel : "mock" | "Amadeus" | "LiteAPI". */
  sourceName: string
  /** Horodatage ISO de la fraîcheur de la donnée. */
  readAt: string
}

export type AvailabilityMode = "mock" | "amadeus" | "liteapi"

export interface AvailabilityResult {
  offers: HotelOffer[]
  mode: AvailabilityMode
  sourceName: string
  /** Messages honnêtes (repli sur mock, quota atteint…). */
  notes: string[]
}

export interface LodgingAvailabilityProvider {
  readonly mode: AvailabilityMode
  search(req: AvailabilityRequest): Promise<AvailabilityResult>
}

/** Nombre de nuits entre deux dates ISO (>= 1). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime()
  const b = new Date(`${checkOut}T00:00:00Z`).getTime()
  const n = Math.round((b - a) / 86_400_000)
  return Math.max(1, n)
}
