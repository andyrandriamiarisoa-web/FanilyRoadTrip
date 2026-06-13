import { describe, it, expect } from "vitest"
import { generateMockItinerary } from "./itinerary-mock"
import {
  AiItineraryDraftSchema,
  AiItineraryRequestSchema,
  itineraryTool,
  ITINERARY_TOOL_NAME,
  type AiItineraryRequest,
} from "./itinerary-types"

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
