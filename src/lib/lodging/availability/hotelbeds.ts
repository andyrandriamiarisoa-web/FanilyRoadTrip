/**
 * `HotelbedsLodgingAvailabilityProvider` — disponibilités **réelles** via l'API
 * Hotelbeds APItude (Hotel Search). **Read-only strict** : on n'appelle que la
 * recherche de tarifs ; aucun endpoint de réservation/paiement.
 *
 * Pointe par défaut sur l'**environnement de test** (`api.test.hotelbeds.com`,
 * 50 req/jour) — dont les serveurs sont **identiques à la production** pour la
 * recherche (mêmes données live), seules les réservations sont neutralisées.
 * Activé en live si `HOTELBEDS_API_KEY` + `HOTELBEDS_API_SECRET` sont posés.
 * Toute erreur est levée → repli mock géré en amont (route API).
 *
 * Auth : HMAC SHA-256 de `apiKey + secret + unixSeconds` envoyé en
 * `X-Signature`, par requête (la signature change toutes les secondes).
 */

import { createHash } from "node:crypto"
import {
  nightsBetween,
  type AvailabilityRequest,
  type AvailabilityResult,
  type HotelOffer,
  type LodgingAvailabilityProvider,
} from "./types"
import { rankOffers } from "./mock"

const TEST_BASE = "https://api.test.hotelbeds.com"
const PROD_BASE = "https://api.hotelbeds.com"

interface HotelbedsOptions {
  apiKey: string
  apiSecret: string
  fetchImpl?: typeof fetch
  /** `true` (défaut) = test env (50 req/jour, données live, pas de booking). */
  useTestEnv?: boolean
  /** Rayon de recherche (km). */
  radiusKm?: number
  /** Permet de figer le temps pour les tests (sinon `Date.now()`). */
  now?: () => number
}

/** Entrée brute (tolérante) d'un hôtel dans la réponse Hotelbeds. */
export interface HotelbedsHotelRaw {
  code?: number | string
  name?: string
  latitude?: number | string
  longitude?: number | string
  destinationName?: string
  currency?: string
  minRate?: number | string
  rooms?: {
    rates?: {
      net?: number | string
      sellingRate?: number | string
    }[]
  }[]
}

function num(v: number | string | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Prix total minimal (centimes EUR) pour un hôtel Hotelbeds, ou null. */
function minPriceCents(hotel: HotelbedsHotelRaw): number | null {
  let best: number | null = null
  for (const room of hotel.rooms ?? []) {
    for (const rate of room.rates ?? []) {
      const v = num(rate.net) ?? num(rate.sellingRate)
      if (v !== null) {
        const cents = Math.round(v * 100)
        if (best === null || cents < best) best = cents
      }
    }
  }
  if (best === null) {
    const fallback = num(hotel.minRate)
    if (fallback !== null) best = Math.round(fallback * 100)
  }
  return best
}

/** Mapper **pur** (testable) : réponse Hotelbeds → offres normalisées, classées. */
export function mapHotelbedsResponse(
  hotels: HotelbedsHotelRaw[],
  req: AvailabilityRequest,
  readAt: string,
): HotelOffer[] {
  const nights = nightsBetween(req.checkIn, req.checkOut)
  const offers: HotelOffer[] = hotels.map((h, i): HotelOffer => {
    const cents = minPriceCents(h)
    const available = cents !== null
    return {
      id: h.code !== undefined ? `hotelbeds-${h.code}` : `hotelbeds-${i}`,
      name: h.name ?? "Hôtel",
      lat: num(h.latitude) ?? undefined,
      lng: num(h.longitude) ?? undefined,
      address: h.destinationName ?? req.city,
      available,
      priceTotalCents: cents,
      nights,
      currency: "EUR",
      sourceStatus: "verified",
      sourceName: "Hotelbeds Test",
      readAt,
    }
  })
  return rankOffers(offers)
}

export class HotelbedsLodgingAvailabilityProvider implements LodgingAvailabilityProvider {
  readonly mode = "hotelbeds" as const
  private readonly opts: HotelbedsOptions
  private readonly fetchImpl: typeof fetch
  private readonly base: string
  private readonly now: () => number

  constructor(opts: HotelbedsOptions) {
    this.opts = opts
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.base = opts.useTestEnv === false ? PROD_BASE : TEST_BASE
    this.now = opts.now ?? Date.now
  }

  /** HMAC SHA-256(apiKey + secret + unixSeconds) → hex. */
  private signature(): string {
    const ts = Math.floor(this.now() / 1000)
    return createHash("sha256")
      .update(`${this.opts.apiKey}${this.opts.apiSecret}${ts}`)
      .digest("hex")
  }

  async search(req: AvailabilityRequest): Promise<AvailabilityResult> {
    const radiusKm = this.opts.radiusKm ?? 8
    const body = {
      stay: { checkIn: req.checkIn, checkOut: req.checkOut },
      occupancies: [
        {
          rooms: 1,
          adults: req.adults,
          children: req.children,
          // Hotelbeds attend des âges par paxes ; pour le mode démo on suppose 8 ans.
          paxes: req.children > 0
            ? Array.from({ length: req.children }, () => ({ type: "CH", age: 8 }))
            : undefined,
        },
      ],
      geolocation: {
        latitude: req.lat,
        longitude: req.lng,
        radius: radiusKm,
        unit: "km",
      },
    }

    const res = await this.fetchImpl(`${this.base}/hotel-api/1.0/hotels`, {
      method: "POST",
      headers: {
        "Api-Key": this.opts.apiKey,
        "X-Signature": this.signature(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Hotelbeds ${res.status}`)

    const json = (await res.json()) as { hotels?: { hotels?: HotelbedsHotelRaw[] } }
    const hotels = json.hotels?.hotels ?? []
    const offers = mapHotelbedsResponse(hotels, req, new Date().toISOString())

    const notes: string[] = []
    if (this.opts.useTestEnv !== false) {
      notes.push(
        "Source : Hotelbeds, environnement de test (données live, 50 req/jour, sans réservation).",
      )
    }
    if (offers.length === 0) {
      notes.push("Aucun hôtel trouvé dans la zone via Hotelbeds.")
    }

    return {
      offers,
      mode: "hotelbeds",
      sourceName: this.opts.useTestEnv === false ? "Hotelbeds" : "Hotelbeds Test",
      notes,
    }
  }
}
