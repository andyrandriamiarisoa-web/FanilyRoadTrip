import { describe, it, expect } from "vitest"
import { planWorkationDay, isWorkDay, weekdayOf, type WorkationInput } from "./day-plan"
import type { Poi } from "@/types"

const poi = (
  id: string,
  category: Poi["category"],
  lat: number,
  lng: number,
  attrs?: Poi["attributes"],
  openingHours: Poi["openingHours"] = null,
): Poi => ({
  id,
  name: id,
  category,
  cityKey: "test",
  lat,
  lng,
  openingHours,
  attributes: attrs,
  sourceStatus: "seed",
  sourceName: "Foursquare",
})

const lodging = { lat: 45.0, lng: 5.0 }

const POIS: Poi[] = [
  poi("cowork-near", "coworking", 45.001, 5.001, { wifi: true, desk: true, ac: true, indoor: true }),
  poi("cowork-far-nowifi", "coworking", 45.05, 5.0, { desk: true, indoor: true }),
  poi("museum-indoor", "museum", 45.002, 5.002, { indoor: true, strollerFriendly: true }),
  poi("aquarium-indoor", "aquarium-zoo", 45.003, 5.003, { indoor: true }),
  poi("park-outdoor", "park", 45.004, 5.004, { indoor: false, strollerFriendly: true }),
  poi("playground-outdoor", "playground", 45.0045, 5.0045, { indoor: false, strollerFriendly: true }),
  poi("resto", "family-restaurant", 45.0015, 5.0015, { indoor: true }),
]

const base: WorkationInput = {
  lodging,
  date: "2026-08-03", // lundi
  workDays: ["monday", "tuesday", "wednesday", "thursday"],
  workWindow: [8.5, 19],
  pois: POIS,
}

describe("weekdayOf / isWorkDay", () => {
  it("dérive le bon jour de semaine", () => {
    expect(weekdayOf("2026-08-03")).toBe("monday")
    expect(weekdayOf("2026-08-08")).toBe("saturday")
  })
  it("ne déclenche pas la logique les jours non travaillés", () => {
    expect(isWorkDay("2026-08-08", base.workDays)).toBe(false)
  })
})

describe("planWorkationDay — jour non travaillé", () => {
  it("renvoie un plan inactif le samedi (Ven–Dim)", () => {
    const p = planWorkationDay({ ...base, date: "2026-08-08" })
    expect(p.isWorkDay).toBe(false)
    expect(p.coworking).toHaveLength(0)
    expect(p.family).toHaveLength(0)
  })
})

describe("planWorkationDay — jour travaillé", () => {
  it("propose ≥ 1 coworking classé par proximité, sans exclusion (anti-pattern #1)", () => {
    const p = planWorkationDay(base)
    expect(p.isWorkDay).toBe(true)
    expect(p.coworking.length).toBe(2) // le coworking sans wifi n'est PAS exclu
    expect(p.coworking[0].poi.id).toBe("cowork-near") // le plus proche d'abord
    expect(p.coworking[0].conformity.level).toBe("conforme")
    expect(p.coworking[1].conformity.level).toBe("à confirmer") // manque wifi, signalé
    expect(p.coworking[1].conformity.notes.join(" ")).toMatch(/connexion/i)
  })

  it("construit un plan de visites famille non vide", () => {
    const p = planWorkationDay(base)
    expect(p.family.length).toBeGreaterThan(0)
    // Un repas est planifié au déjeuner.
    expect(p.family.some((a) => a.kind === "meal")).toBe(true)
  })

  it("respecte la fenêtre de travail (activités dans 8h30–19h)", () => {
    const p = planWorkationDay(base)
    for (const a of p.family) {
      expect(a.startHour).toBeGreaterThanOrEqual(8.5 - 1e-9)
      expect(a.endHour).toBeLessThanOrEqual(19 + 1e-9)
    }
  })

  it("sous vigilance chaleur, privilégie l'intérieur entre 12h et 16h", () => {
    const p = planWorkationDay({ ...base, heatAlert: true })
    const midday = p.family.filter((a) => a.startHour >= 12 && a.endHour <= 16 && a.kind === "visit")
    expect(midday.length).toBeGreaterThan(0)
    for (const a of midday) {
      expect(a.poi.attributes?.indoor).toBe(true)
      expect(a.heatSafe).toBe(true)
    }
    expect(p.notes.join(" ")).toMatch(/intérieur/i)
  })

  it("signale honnêtement l'absence de coworking", () => {
    const p = planWorkationDay({ ...base, pois: POIS.filter((x) => x.category !== "coworking") })
    expect(p.coworking).toHaveLength(0)
    expect(p.notes.join(" ")).toMatch(/aucun coworking/i)
  })

  it("est déterministe", () => {
    expect(planWorkationDay(base)).toEqual(planWorkationDay(base))
  })
})
