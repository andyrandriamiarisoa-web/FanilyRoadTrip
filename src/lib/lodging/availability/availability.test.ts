import { describe, it, expect } from "vitest"
import { MockLodgingAvailabilityProvider, rankOffers } from "./mock"
import { CachingLodgingAvailabilityProvider } from "./cache"
import { mapLiteApiResponse, type LiteApiHotelRaw } from "./liteapi"
import { mapHotelbedsResponse, type HotelbedsHotelRaw } from "./hotelbeds"
import { nightsBetween, type AvailabilityRequest, type HotelOffer } from "./types"

const req: AvailabilityRequest = {
  city: "Marseille",
  lat: 43.3,
  lng: 5.37,
  checkIn: "2026-08-07",
  checkOut: "2026-08-09",
  adults: 2,
  children: 1,
}

describe("nightsBetween", () => {
  it("compte les nuits (>= 1)", () => {
    expect(nightsBetween("2026-08-07", "2026-08-09")).toBe(2)
    expect(nightsBetween("2026-08-07", "2026-08-07")).toBe(1)
  })
})

describe("MockLodgingAvailabilityProvider", () => {
  it("renvoie des offres réalistes, déterministes", async () => {
    const p = new MockLodgingAvailabilityProvider()
    const a = await p.search(req)
    const b = await p.search(req)
    expect(a).toEqual(b) // déterministe
    expect(a.offers.length).toBeGreaterThan(0)
    expect(a.mode).toBe("mock")
  })

  it("prix total = prix/nuit × nuits, en centimes EUR", async () => {
    const p = new MockLodgingAvailabilityProvider()
    const { offers } = await p.search(req)
    const nights = nightsBetween(req.checkIn, req.checkOut)
    for (const o of offers) {
      expect(o.nights).toBe(nights)
      expect(o.currency).toBe("EUR")
      if (o.available) {
        expect(o.priceTotalCents).toBeGreaterThan(0)
        expect(o.priceTotalCents! % nights).toBe(0)
      } else {
        expect(o.priceTotalCents).toBeNull()
      }
    }
  })

  it("affiche toujours une source et une fraîcheur (anti-pattern #3)", async () => {
    const { offers } = await new MockLodgingAvailabilityProvider().search(req)
    for (const o of offers) {
      expect(o.sourceStatus).toBeDefined()
      expect(o.sourceName.length).toBeGreaterThan(0)
      expect(o.readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it("n'expose aucune action de réservation (read-only)", async () => {
    const result = await new MockLodgingAvailabilityProvider().search(req)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/book|booking|reserve|payment|checkout-url/i)
  })
})

describe("rankOffers — classer sans exclure (anti-pattern #1)", () => {
  const base: HotelOffer = {
    id: "x", name: "X", available: true, priceTotalCents: 10000, nights: 2,
    currency: "EUR", sourceStatus: "estimated", sourceName: "mock", readAt: "2026-08-07T08:00:00.000Z",
  }
  it("disponibles d'abord (prix croissant), indisponibles ensuite — rien n'est supprimé", () => {
    const offers: HotelOffer[] = [
      { ...base, id: "indispo", available: false, priceTotalCents: null },
      { ...base, id: "cher", priceTotalCents: 30000 },
      { ...base, id: "pas-cher", priceTotalCents: 12000 },
    ]
    const ranked = rankOffers(offers)
    expect(ranked.map((o) => o.id)).toEqual(["pas-cher", "cher", "indispo"])
    expect(ranked).toHaveLength(3) // l'indisponible reste présent
  })
})

describe("mapLiteApiResponse — mapping LiteAPI → offres normalisées", () => {
  it("retient le prix minimal, marque la source, classe sans exclure", () => {
    const raw: LiteApiHotelRaw[] = [
      {
        hotelId: "h1", name: "Hôtel A", latitude: 43.3, longitude: 5.37,
        roomTypes: [
          { rates: [{ retailRate: { total: [{ amount: 240, currency: "EUR" }] } }] },
          { rates: [{ retailRate: { total: [{ amount: 200, currency: "EUR" }] } }] },
        ],
      },
      { hotelId: "h2", name: "Hôtel Complet", roomTypes: [] }, // pas de tarif → indisponible
    ]
    const offers = mapLiteApiResponse(raw, req, "2026-08-07T08:00:00.000Z")
    expect(offers).toHaveLength(2) // l'indisponible n'est pas exclu
    expect(offers[0].id).toBe("h1") // disponible en tête
    expect(offers[0].priceTotalCents).toBe(20000) // min(240,200) × 100
    expect(offers[0].sourceName).toBe("LiteAPI")
    expect(offers[0].sourceStatus).toBe("verified")
    const complet = offers.find((o) => o.id === "h2")!
    expect(complet.available).toBe(false)
    expect(complet.priceTotalCents).toBeNull()
  })
})

describe("mapHotelbedsResponse — mapping Hotelbeds → offres normalisées", () => {
  it("retient le prix net minimal, marque la source sandbox, classe sans exclure", () => {
    const raw: HotelbedsHotelRaw[] = [
      {
        code: 4242,
        name: "Hôtel Alpha",
        latitude: 43.3,
        longitude: 5.37,
        destinationName: "Marseille",
        rooms: [
          { rates: [{ net: "180.00" }, { net: "210.50" }] },
          { rates: [{ net: 175.25 }] },
        ],
      },
      { code: 9999, name: "Hôtel Complet", rooms: [] }, // pas de tarif → indisponible
    ]
    const offers = mapHotelbedsResponse(raw, req, "2026-08-07T08:00:00.000Z")
    expect(offers).toHaveLength(2) // l'indisponible n'est pas exclu
    expect(offers[0].id).toBe("hotelbeds-4242")
    expect(offers[0].priceTotalCents).toBe(17525) // min(180, 210.5, 175.25) × 100
    expect(offers[0].sourceName).toBe("Hotelbeds Test")
    expect(offers[0].sourceStatus).toBe("verified")
    const complet = offers.find((o) => o.id === "hotelbeds-9999")!
    expect(complet.available).toBe(false)
    expect(complet.priceTotalCents).toBeNull()
  })

  it("retombe sur minRate si aucune chambre n'a de tarif détaillé", () => {
    const raw: HotelbedsHotelRaw[] = [
      { code: 1, name: "Hôtel Beta", minRate: "99.00", rooms: [] },
    ]
    const offers = mapHotelbedsResponse(raw, req, "2026-08-07T08:00:00.000Z")
    expect(offers[0].available).toBe(true)
    expect(offers[0].priceTotalCents).toBe(9900)
  })
})

describe("CachingLodgingAvailabilityProvider", () => {
  it("ne délègue qu'une fois dans la fenêtre TTL", async () => {
    let calls = 0
    const delegate = {
      mode: "liteapi" as const,
      async search() {
        calls++
        return { offers: [], mode: "liteapi" as const, sourceName: "LiteAPI", notes: [] }
      },
    }
    let t = 0
    const cached = new CachingLodgingAvailabilityProvider(delegate, {
      ttlMs: 1000,
      now: () => t,
      store: new Map(),
    })
    await cached.search(req)
    await cached.search(req)
    expect(calls).toBe(1)
    t = 2000
    await cached.search(req)
    expect(calls).toBe(2)
  })
})
