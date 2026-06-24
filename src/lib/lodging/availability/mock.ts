/**
 * `MockLodgingAvailabilityProvider` — disponibilités **simulées réalistes**,
 * déterministes et hors-ligne (défaut, aucune clé requise).
 *
 * On dérive un petit jeu d'offres d'un hachage stable de (ville + dates) :
 * prix plausibles, quelques établissements **indisponibles** (jamais exclus —
 * ils sont renvoyés et signalés). Aucune action de réservation n'existe.
 */

import {
  nightsBetween,
  type AvailabilityRequest,
  type AvailabilityResult,
  type HotelOffer,
  type LodgingAvailabilityProvider,
} from "./types"

const HOTEL_TEMPLATES: { suffix: string; baseNightlyCents: number; rating: number; amenities: HotelOffer["amenities"] }[] = [
  { suffix: "Hôtel Centre-Ville", baseNightlyCents: 9_500, rating: 4.1, amenities: { ac: true, wifi: true, parking: true, breakfast: true } },
  { suffix: "Appart'Hôtel Gare", baseNightlyCents: 8_200, rating: 4.0, amenities: { ac: true, wifi: true, parking: true } },
  { suffix: "Maison d'hôtes du Parc", baseNightlyCents: 11_000, rating: 4.6, amenities: { ac: false, wifi: true, parking: true, breakfast: true } },
  { suffix: "Boutique Hôtel Vieux Quartier", baseNightlyCents: 13_500, rating: 4.4, amenities: { ac: true, wifi: true } },
  { suffix: "Résidence Familiale", baseNightlyCents: 7_400, rating: 3.8, amenities: { ac: true, wifi: true, parking: true } },
]

export class MockLodgingAvailabilityProvider implements LodgingAvailabilityProvider {
  readonly mode = "mock" as const

  async search(req: AvailabilityRequest): Promise<AvailabilityResult> {
    const nights = nightsBetween(req.checkIn, req.checkOut)
    const seed = hash(`${req.city}|${req.checkIn}|${req.checkOut}|${req.adults}|${req.children}`)
    const readAt = new Date(`${req.checkIn}T08:00:00.000Z`).toISOString()

    const offers: HotelOffer[] = HOTEL_TEMPLATES.map((tpl, i) => {
      const r = pseudo(seed + i * 1013)
      // Variation de prix ±20 % + supplément enfants léger.
      const factor = 0.8 + (r % 41) / 100 // 0.80 → 1.20
      const childSurcharge = req.children > 0 ? 1.08 : 1
      const nightly = Math.round(tpl.baseNightlyCents * factor * childSurcharge)
      // ~1 établissement sur 5 indisponible (non exclu — signalé).
      const available = pseudo(seed + i * 7919) % 5 !== 0
      return {
        id: `mock-${slug(req.city)}-${i}`,
        name: `${tpl.suffix} ${req.city}`,
        lat: req.lat,
        lng: req.lng,
        address: req.city,
        available,
        priceTotalCents: available ? nightly * nights : null,
        nights,
        currency: "EUR",
        rating: tpl.rating,
        amenities: tpl.amenities,
        sourceStatus: "estimated",
        sourceName: "mock",
        readAt,
      }
    })

    return {
      offers: rankOffers(offers),
      mode: "mock",
      sourceName: "mock",
      notes: ["Disponibilités simulées (mode démo) — posez une clé LiteAPI ou Hotelbeds (sandbox) pour des données live."],
    }
  }
}

/**
 * Tri **sans exclusion** : disponibles d'abord (prix croissant), puis
 * indisponibles. Déterministe (départage par id).
 */
export function rankOffers(offers: HotelOffer[]): HotelOffer[] {
  return [...offers].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1
    const pa = a.priceTotalCents ?? Number.MAX_SAFE_INTEGER
    const pb = b.priceTotalCents ?? Number.MAX_SAFE_INTEGER
    return pa - pb || a.id.localeCompare(b.id)
  })
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pseudo(n: number): number {
  let x = n >>> 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return x >>> 0
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
