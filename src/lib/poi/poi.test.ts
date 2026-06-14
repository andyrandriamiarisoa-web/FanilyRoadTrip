import { describe, it, expect } from "vitest"
import {
  loadPois,
  cityKeyOf,
  haversineKm,
  poisNear,
  poisInCity,
  openStateAt,
  formatHoursForDay,
  isoWeekday,
} from "./poi"
import type { Poi } from "@/types"

describe("loadPois — seed embarqué valide (Zod)", () => {
  it("charge un jeu non vide, chaque POI ayant une source", () => {
    const pois = loadPois()
    expect(pois.length).toBeGreaterThan(20)
    for (const p of pois) {
      expect(p.sourceStatus).toBeDefined()
      expect(p.sourceName.length).toBeGreaterThan(0)
    }
  })

  it("couvre Dijon, Lyon et Marseille (critère R2)", () => {
    for (const city of ["Dijon", "Lyon", "Marseille"]) {
      expect(poisInCity(city).length).toBeGreaterThan(0)
    }
  })
})

describe("cityKeyOf — normalisation", () => {
  it("retire accents, casse, apostrophes et espaces", () => {
    expect(cityKeyOf("Tain-l'Hermitage")).toBe("tain-l-hermitage")
    expect(cityKeyOf("Mâcon")).toBe("macon")
    expect(cityKeyOf("Montélimar")).toBe("montelimar")
  })
})

describe("haversineKm", () => {
  it("≈ 0 pour le même point", () => {
    expect(haversineKm({ lat: 45, lng: 5 }, { lat: 45, lng: 5 })).toBeCloseTo(0, 5)
  })
  it("plausible Paris→Lyon (~390–400 km)", () => {
    const d = haversineKm({ lat: 48.86, lng: 2.35 }, { lat: 45.75, lng: 4.84 })
    expect(d).toBeGreaterThan(380)
    expect(d).toBeLessThan(420)
  })
})

const sample: Poi[] = [
  { id: "a", name: "Proche", category: "museum", cityKey: "x", lat: 45.0, lng: 5.0, openingHours: null, sourceStatus: "seed", sourceName: "Overture" },
  { id: "b", name: "Loin", category: "park", cityKey: "x", lat: 45.5, lng: 5.0, openingHours: null, sourceStatus: "seed", sourceName: "Foursquare" },
  { id: "c", name: "Très loin", category: "museum", cityKey: "x", lat: 46.0, lng: 5.0, openingHours: null, sourceStatus: "seed", sourceName: "Overture" },
]

describe("poisNear — classement sans exclusion (anti-pattern #1)", () => {
  it("trie par proximité croissante", () => {
    const r = poisNear({ near: { lat: 45.0, lng: 5.0 }, pois: sample })
    expect(r.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(r[0].distanceKm).toBeCloseTo(0, 1)
  })

  it("filtre par catégorie mais n'exclut rien à l'intérieur", () => {
    const r = poisNear({ near: { lat: 45.0, lng: 5.0 }, categories: ["museum"], pois: sample })
    expect(r.map((p) => p.id)).toEqual(["a", "c"])
  })

  it("respecte le rayon et la limite", () => {
    const r = poisNear({ near: { lat: 45.0, lng: 5.0 }, radiusKm: 60, pois: sample })
    expect(r.every((p) => p.distanceKm <= 60)).toBe(true)
    const limited = poisNear({ near: { lat: 45.0, lng: 5.0 }, limit: 2, pois: sample })
    expect(limited).toHaveLength(2)
  })

  it("est déterministe", () => {
    const a = poisNear({ near: { lat: 45.0, lng: 5.0 }, pois: sample })
    const b = poisNear({ near: { lat: 45.0, lng: 5.0 }, pois: sample })
    expect(a).toEqual(b)
  })
})

describe("horaires d'ouverture — couverture partielle honnête", () => {
  const withHours: Poi = {
    id: "m", name: "Musée", category: "museum", cityKey: "x", lat: 45, lng: 5,
    openingHours: [{ day: 2, opens: "10:00", closes: "18:00" }],
    sourceStatus: "seed", sourceName: "Overture",
  }
  const noHours: Poi = { ...withHours, id: "n", openingHours: null }

  it("ouvert pendant la plage, fermé hors plage", () => {
    expect(openStateAt(withHours, 2, 12)).toBe("open")
    expect(openStateAt(withHours, 2, 19)).toBe("closed")
    expect(openStateAt(withHours, 0, 12)).toBe("closed")
  })

  it("inconnu si horaires absents (jamais inventés)", () => {
    expect(openStateAt(noHours, 2, 12)).toBe("unknown")
    expect(formatHoursForDay(noHours, 2)).toMatch(/inconnu/i)
  })

  it("libellé lisible", () => {
    expect(formatHoursForDay(withHours, 2)).toBe("10:00–18:00")
    expect(formatHoursForDay(withHours, 0)).toBe("Fermé")
  })
})

describe("isoWeekday", () => {
  it("lundi = 0, dimanche = 6", () => {
    expect(isoWeekday(new Date("2026-06-15"))).toBe(0) // lundi
    expect(isoWeekday(new Date("2026-06-14"))).toBe(6) // dimanche
  })
})
