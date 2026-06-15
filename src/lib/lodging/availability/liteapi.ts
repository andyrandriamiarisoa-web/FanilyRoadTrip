/**
 * `LiteApiLodgingAvailabilityProvider` — alternative à Amadeus (Lot R5).
 *
 * LiteAPI (modèle à commission, 3M+ établissements) expose des **rates temps
 * réel**. **Read-only strict** : on n'appelle que la recherche de tarifs ;
 * aucun endpoint de réservation/paiement. Activé en live si `LITEAPI_KEY` est
 * posée. Toute erreur est levée → repli mock géré en amont (route API).
 */

import {
  nightsBetween,
  type AvailabilityRequest,
  type AvailabilityResult,
  type HotelOffer,
  type LodgingAvailabilityProvider,
} from "./types"
import { rankOffers } from "./mock"

const RATES_URL = "https://api.liteapi.travel/v3.0/hotels/rates"

interface LiteApiOptions {
  apiKey: string
  fetchImpl?: typeof fetch
  /** Rayon de recherche (km). */
  radiusKm?: number
}

/** Entrée brute (tolérante) d'un hôtel dans la réponse rates LiteAPI. */
export interface LiteApiHotelRaw {
  hotelId?: string
  name?: string
  latitude?: number
  longitude?: number
  address?: string
  roomTypes?: {
    rates?: {
      retailRate?: { total?: { amount?: number; currency?: string }[] }
    }[]
  }[]
}

/** Prix total minimal (centimes EUR) trouvé pour un hôtel, ou null. */
function minPriceCents(hotel: LiteApiHotelRaw): number | null {
  let best: number | null = null
  for (const rt of hotel.roomTypes ?? []) {
    for (const rate of rt.rates ?? []) {
      for (const t of rate.retailRate?.total ?? []) {
        if (typeof t.amount === "number") {
          const cents = Math.round(t.amount * 100)
          if (best === null || cents < best) best = cents
        }
      }
    }
  }
  return best
}

/** Mapper **pur** (testable) : réponse LiteAPI → offres normalisées, classées. */
export function mapLiteApiResponse(
  hotels: LiteApiHotelRaw[],
  req: AvailabilityRequest,
  readAt: string,
): HotelOffer[] {
  const nights = nightsBetween(req.checkIn, req.checkOut)
  const offers: HotelOffer[] = hotels.map((h, i): HotelOffer => {
    const cents = minPriceCents(h)
    const available = cents !== null
    return {
      id: h.hotelId ?? `liteapi-${i}`,
      name: h.name ?? "Hôtel",
      lat: h.latitude,
      lng: h.longitude,
      address: h.address ?? req.city,
      available,
      priceTotalCents: cents,
      nights,
      currency: "EUR",
      sourceStatus: "verified",
      sourceName: "LiteAPI",
      readAt,
    }
  })
  return rankOffers(offers)
}

export class LiteApiLodgingAvailabilityProvider implements LodgingAvailabilityProvider {
  readonly mode = "liteapi" as const
  private readonly opts: LiteApiOptions
  private readonly fetchImpl: typeof fetch

  constructor(opts: LiteApiOptions) {
    this.opts = opts
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async search(req: AvailabilityRequest): Promise<AvailabilityResult> {
    const res = await this.fetchImpl(RATES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.opts.apiKey },
      body: JSON.stringify({
        checkin: req.checkIn,
        checkout: req.checkOut,
        currency: "EUR",
        guestNationality: "FR",
        // `children` = tableau des ÂGES (longueur = nb d'enfants), pas le nombre.
        occupancies: [{ adults: req.adults, children: Array.from({ length: req.children }, () => 8) }],
        latitude: req.lat,
        longitude: req.lng,
        radius: (this.opts.radiusKm ?? 8) * 1000,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`LiteAPI ${res.status}`)
    const json = (await res.json()) as { data?: LiteApiHotelRaw[] }
    const offers = mapLiteApiResponse(json.data ?? [], req, new Date().toISOString())
    return {
      offers,
      mode: "liteapi",
      sourceName: "LiteAPI",
      notes: offers.length === 0 ? ["Aucun hôtel trouvé dans la zone via LiteAPI."] : [],
    }
  }
}
