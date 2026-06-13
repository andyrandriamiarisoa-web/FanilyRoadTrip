import { describe, it, expect } from "vitest"
import { generateMockItinerary } from "./itinerary-mock"
import { attachRealisticLegs } from "./itinerary-legs"
import {
  AiItineraryDraftSchema,
  AiItineraryRequestSchema,
  itineraryTool,
  ITINERARY_TOOL_NAME,
  type AiItineraryRequest,
  type AiItineraryDraft,
} from "./itinerary-types"
import { estimateRealisticLeg } from "@/lib/routing/realistic-time"
import { computeHaversineFallback } from "@/lib/providers/routing"

function req(over: Partial<AiItineraryRequest> = {}): AiItineraryRequest {
  return {
    description: "Un voyage tranquille avec étapes culturelles et du télétravail.",
    destination: "Marseille",
    dateFrom: "2026-08-03", // lundi
    dateTo: "2026-08-09", // dimanche
    constraints: [],
    workDays: ["monday", "tuesday", "wednesday", "thursday"],
    ...over,
  }
}

describe("generateMockItinerary", () => {
  const draft = generateMockItinerary(req())

  it("produit un brouillon conforme au schéma Zod", () => {
    expect(() => AiItineraryDraftSchema.parse(draft)).not.toThrow()
  })

  it("couvre toutes les dates de la plage", () => {
    expect(draft.days).toHaveLength(7)
    expect(draft.days[0].date).toBe("2026-08-03")
    expect(draft.days.at(-1)?.date).toBe("2026-08-09")
  })

  it("marque les jours travaillés (lun–jeu) en workation", () => {
    const monday = draft.days.find((d) => d.date === "2026-08-03")
    expect(monday?.title).toMatch(/workation/i)
    expect(monday?.lodgingHint).toMatch(/bureau/i)
    expect(monday?.constraintNotes.some((n) => /jour travaillé/i.test(n))).toBe(true)
  })

  it("traite le week-end en découverte (pas de télétravail)", () => {
    const saturday = draft.days.find((d) => d.date === "2026-08-08")
    expect(saturday?.title).toMatch(/découverte/i)
    expect(saturday?.constraintNotes.some((n) => /jour travaillé/i.test(n))).toBe(false)
  })

  it("rappelle bébé + canicule + hébergement conforme partout", () => {
    for (const day of draft.days) {
      expect(day.constraintNotes.some((n) => /bébé|pause/i.test(n))).toBe(true)
      expect(day.constraintNotes.some((n) => /canicule|12h/i.test(n))).toBe(true)
      expect(day.lodgingHint).toMatch(/matelas ferme|clim/i)
    }
  })

  it("est déterministe", () => {
    expect(generateMockItinerary(req())).toEqual(draft)
  })

  it("retombe sur une journée si la plage est invalide", () => {
    const d = generateMockItinerary(req({ dateFrom: "2026-08-10", dateTo: "2026-08-01" }))
    expect(d.days).toHaveLength(1)
  })

  it("plafonne à 21 jours", () => {
    const d = generateMockItinerary(req({ dateFrom: "2026-08-01", dateTo: "2026-12-31" }))
    expect(d.days.length).toBeLessThanOrEqual(21)
  })
})

describe("AiItineraryRequestSchema", () => {
  it("applique les valeurs par défaut", () => {
    const parsed = AiItineraryRequestSchema.parse({
      description: "x",
      destination: "Lyon",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-02",
    })
    expect(parsed.constraints).toEqual([])
    expect(parsed.workDays).toEqual([])
  })

  it("rejette une description vide", () => {
    expect(() =>
      AiItineraryRequestSchema.parse({
        description: "",
        destination: "Lyon",
        dateFrom: "a",
        dateTo: "b",
      }),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Integration : attachRealisticLegs
// ---------------------------------------------------------------------------

describe("attachRealisticLegs", () => {
  it("Montélimar → Paris (~580 km) donne totalMinutes > 360 (plus jamais 3h40)", async () => {
    // On simule un draft avec un trajet Montélimar → Paris
    const mockDraft: AiItineraryDraft = {
      destination: "Paris",
      summary: "Test",
      days: [
        {
          date: "2026-08-08", // samedi août
          title: "Trajet Montélimar → Paris",
          drivingFromTo: "Montélimar → Paris",
          activities: [],
          lodgingHint: "Hébergement confort",
          constraintNotes: [],
        },
      ],
      constraintsApplied: [],
    }

    const enriched = await attachRealisticLegs(mockDraft, { babyOnboard: true, isEv: true })
    const leg = enriched.days[0].leg

    expect(leg).toBeDefined()
    expect(leg!.distanceKm).toBeGreaterThan(200) // Montélimar→Paris >> 200 km
    expect(leg!.totalMinutes).toBeGreaterThan(360) // > 6 heures
    expect(leg!.source).toMatch(/verified|seed|estimated/)
  })

  it("calcul Montélimar → Paris via haversine si OSRM indisponible (mode test)", () => {
    // Coordonnées Montélimar : 44.56, 4.75 — Paris : 48.86, 2.35
    // On vérifie le chemin haversine directement
    const route = computeHaversineFallback({
      fromLat: 44.56,
      fromLng: 4.75,
      toLat: 48.86,
      toLng: 2.35,
    })
    expect(route.distanceKm).toBeGreaterThan(450)
    expect(route.sourceStatus).toBe("estimated")

    const leg = estimateRealisticLeg({
      distanceKm: route.distanceKm,
      freeFlowMinutes: route.durationMinutes,
      date: "2026-08-08",
      babyOnboard: true,
      isEv: true,
    })
    // Plafond absolu : totalMinutes > 360 même en cas conservatif
    expect(leg.totalMinutes).toBeGreaterThan(360)
    // Ventilation lisible
    expect(leg.drivingMinutes).toBeGreaterThan(0)
    expect(leg.pauseMinutes).toBeGreaterThan(0)   // bébé
    expect(leg.chargingMinutes).toBeGreaterThan(0) // EV
  })

  it("laisse leg undefined si drivingFromTo est absent", async () => {
    const mockDraft: AiItineraryDraft = {
      destination: "Lyon",
      summary: "Test sans trajet",
      days: [
        {
          date: "2026-08-10",
          title: "Journée sur place",
          activities: ["Visite du musée"],
          lodgingHint: "Hôtel",
          constraintNotes: [],
          // pas de drivingFromTo
        },
      ],
      constraintsApplied: [],
    }
    const enriched = await attachRealisticLegs(mockDraft, { babyOnboard: true, isEv: true })
    expect(enriched.days[0].leg).toBeUndefined()
  })

  it("laisse leg undefined si la ville est inconnue (best-effort)", async () => {
    const mockDraft: AiItineraryDraft = {
      destination: "Nulle Part",
      summary: "Test ville inconnue",
      days: [
        {
          date: "2026-08-10",
          title: "Trajet vers l'inconnu",
          drivingFromTo: "Atlantis → Eldorado",
          activities: [],
          lodgingHint: "Hôtel",
          constraintNotes: [],
        },
      ],
      constraintsApplied: [],
    }
    const enriched = await attachRealisticLegs(mockDraft, { babyOnboard: true, isEv: true })
    // Les villes sont inconnues → leg doit rester undefined
    expect(enriched.days[0].leg).toBeUndefined()
  })

  it("le brouillon mock enrichi respecte le schéma Zod", async () => {
    const mockReq: AiItineraryRequest = {
      description: "Voyage test",
      destination: "Marseille",
      dateFrom: "2026-08-03",
      dateTo: "2026-08-09",
      constraints: [],
      workDays: ["monday", "tuesday", "wednesday", "thursday"],
    }
    const draft = generateMockItinerary(mockReq)
    const enriched = await attachRealisticLegs(draft, { babyOnboard: true, isEv: true })
    expect(() => AiItineraryDraftSchema.parse(enriched)).not.toThrow()
  })
})

describe("itineraryTool (forced tool use)", () => {
  it("expose un nom et un schéma d'entrée objet", () => {
    expect(itineraryTool.name).toBe(ITINERARY_TOOL_NAME)
    expect(itineraryTool.input_schema.type).toBe("object")
    expect(itineraryTool.input_schema.required).toContain("days")
  })

  it("le schéma d'outil accepte une sortie mock valide", () => {
    const draft = generateMockItinerary(req())
    // La sortie mock doit satisfaire le même schéma que celui imposé à l'IA.
    expect(() => AiItineraryDraftSchema.parse(draft)).not.toThrow()
  })
})
