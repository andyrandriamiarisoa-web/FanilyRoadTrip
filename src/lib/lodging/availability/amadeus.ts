/**
 * `AmadeusLodgingAvailabilityProvider` — disponibilités **réelles** via l'API
 * Amadeus Self-Service (Hotel Search), à palier gratuit. **Read-only strict** :
 * uniquement les endpoints de recherche/tarifs ; aucun endpoint de réservation
 * ou de paiement n'est appelé.
 *
 * Activé seulement en mode live avec `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`.
 * Toute erreur (quota 429, panne…) est levée — le repli mock est géré en amont
 * (route API), avec un message honnête.
 */

import {
  nightsBetween,
  type AvailabilityRequest,
  type AvailabilityResult,
  type HotelOffer,
  type LodgingAvailabilityProvider,
} from "./types"
import { rankOffers } from "./mock"

const TOKEN_URL = "https://api.amadeus.com/v1/security/oauth2/token"
const BY_GEO_URL = "https://api.amadeus.com/v1/reference-data/locations/hotels/by-geocode"
const OFFERS_URL = "https://api.amadeus.com/v3/shopping/hotel-offers"

interface AmadeusOptions {
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
  /** Nombre maximal d'hôtels interrogés (préserve le quota). */
  maxHotels?: number
}

export class AmadeusLodgingAvailabilityProvider implements LodgingAvailabilityProvider {
  readonly mode = "amadeus" as const
  private readonly opts: AmadeusOptions
  private readonly fetchImpl: typeof fetch

  constructor(opts: AmadeusOptions) {
    this.opts = opts
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async search(req: AvailabilityRequest): Promise<AvailabilityResult> {
    const token = await this.token()
    const hotelIds = await this.hotelIdsNear(req, token)

    if (hotelIds.length === 0) {
      return { offers: [], mode: "amadeus", sourceName: "Amadeus", notes: ["Aucun hôtel trouvé dans la zone via Amadeus."] }
    }

    const nights = nightsBetween(req.checkIn, req.checkOut)
    const readAt = new Date().toISOString()
    const offers = await this.offersFor(hotelIds, req, token, nights, readAt)

    return {
      offers: rankOffers(offers),
      mode: "amadeus",
      sourceName: "Amadeus",
      notes: [],
    }
  }

  private async token(): Promise<string> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`Amadeus auth ${res.status}`)
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) throw new Error("Amadeus auth: jeton absent")
    return data.access_token
  }

  private async hotelIdsNear(req: AvailabilityRequest, token: string): Promise<string[]> {
    const url =
      `${BY_GEO_URL}?latitude=${req.lat}&longitude=${req.lng}` +
      `&radius=8&radiusUnit=KM&hotelSource=ALL`
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`Amadeus by-geocode ${res.status}`)
    const data = (await res.json()) as { data?: { hotelId: string }[] }
    const max = this.opts.maxHotels ?? 20
    return (data.data ?? []).map((h) => h.hotelId).filter(Boolean).slice(0, max)
  }

  private async offersFor(
    hotelIds: string[],
    req: AvailabilityRequest,
    token: string,
    nights: number,
    readAt: string,
  ): Promise<HotelOffer[]> {
    const url =
      `${OFFERS_URL}?hotelIds=${encodeURIComponent(hotelIds.join(","))}` +
      `&checkInDate=${req.checkIn}&checkOutDate=${req.checkOut}` +
      `&adults=${req.adults}&roomQuantity=1&currency=EUR&bestRateOnly=true`
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Amadeus hotel-offers ${res.status}`)

    interface OfferEntry {
      available?: boolean
      hotel?: { hotelId?: string; name?: string; latitude?: number; longitude?: number }
      offers?: { price?: { total?: string } }[]
    }
    const data = (await res.json()) as { data?: OfferEntry[] }

    return (data.data ?? []).map((entry, i): HotelOffer => {
      const total = entry.offers?.[0]?.price?.total
      const cents = total ? Math.round(parseFloat(total) * 100) : null
      const available = entry.available !== false && cents !== null
      return {
        id: entry.hotel?.hotelId ?? `amadeus-${i}`,
        name: entry.hotel?.name ?? "Hôtel",
        lat: entry.hotel?.latitude,
        lng: entry.hotel?.longitude,
        address: req.city,
        available,
        priceTotalCents: available ? cents : null,
        nights,
        currency: "EUR",
        sourceStatus: "verified",
        sourceName: "Amadeus",
        readAt,
      }
    })
  }
}
