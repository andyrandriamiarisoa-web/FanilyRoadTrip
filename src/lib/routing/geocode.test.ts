/**
 * Tests unitaires — geocode.ts (M7)
 *
 * Aucun réseau : seul le chemin déterministe (seed) est testé.
 */

import { describe, it, expect } from "vitest"
import { parseDrivingFromTo, geocodeCity, normalizeCity } from "./geocode"

// ---------------------------------------------------------------------------
// normalizeCity
// ---------------------------------------------------------------------------

describe("normalizeCity", () => {
  it("supprime les accents", () => {
    expect(normalizeCity("Montélimar")).toBe("montelimar")
    expect(normalizeCity("Aix-en-Provence")).toBe("aix en provence")
    expect(normalizeCity("Tain-l'Hermitage")).toBe("tain l'hermitage")
  })

  it("passe en minuscules et trim", () => {
    expect(normalizeCity("  PARIS  ")).toBe("paris")
    expect(normalizeCity("Lyon")).toBe("lyon")
  })
})

// ---------------------------------------------------------------------------
// parseDrivingFromTo
// ---------------------------------------------------------------------------

describe("parseDrivingFromTo", () => {
  it("parse le format flèche Unicode", () => {
    expect(parseDrivingFromTo("Paris → Marseille")).toEqual({
      from: "Paris",
      to: "Marseille",
    })
  })

  it("parse le format ASCII ->", () => {
    expect(parseDrivingFromTo("Dijon -> Mâcon")).toEqual({
      from: "Dijon",
      to: "Mâcon",
    })
  })

  it("parse le format tiret long", () => {
    expect(parseDrivingFromTo("Lyon — Valence")).toEqual({
      from: "Lyon",
      to: "Valence",
    })
  })

  it("retire les parenthèses du texte traité", () => {
    // "(retour)" est retiré avant parsing, donc "to" n'en contient plus
    expect(parseDrivingFromTo("Marseille → Fresnes (retour)")).toEqual({
      from: "Marseille",
      to: "Fresnes",
    })
    // Parenthèses en milieu → retirées avant split
    expect(parseDrivingFromTo("(départ) Paris → Lyon")).toEqual({
      from: "Paris",
      to: "Lyon",
    })
  })

  it("retourne null si entrée vide ou espaces", () => {
    expect(parseDrivingFromTo("")).toBeNull()
    expect(parseDrivingFromTo("  ")).toBeNull()
  })

  it("« à » est un séparateur valide (trajet type « Paris à Lyon »)", () => {
    // Le séparateur " à " est intentionnel pour les formulations françaises
    const result = parseDrivingFromTo("Paris à Lyon")
    expect(result).toEqual({ from: "Paris", to: "Lyon" })
  })
})

// ---------------------------------------------------------------------------
// geocodeCity (seed)
// ---------------------------------------------------------------------------

describe("geocodeCity", () => {
  it("trouve Paris", () => {
    const r = geocodeCity("Paris")
    expect(r).not.toBeNull()
    expect(r?.source).toBe("seed")
    expect(r?.lat).toBeCloseTo(48.86, 1)
    expect(r?.lng).toBeCloseTo(2.35, 1)
  })

  it("trouve Marseille", () => {
    const r = geocodeCity("Marseille")
    expect(r).not.toBeNull()
    expect(r?.lat).toBeCloseTo(43.30, 1)
  })

  it("est insensible à la casse", () => {
    expect(geocodeCity("marseille")).not.toBeNull()
    expect(geocodeCity("PARIS")).not.toBeNull()
  })

  it("est insensible aux accents", () => {
    // Montélimar sans accent
    expect(geocodeCity("Montelimar")).not.toBeNull()
    // Aix-en-Provence avec tiret
    expect(geocodeCity("aix-en-provence")).not.toBeNull()
  })

  it("retourne null pour une ville inconnue", () => {
    expect(geocodeCity("Atlantis")).toBeNull()
  })

  it("trouve Fresnes (commune de référence)", () => {
    const r = geocodeCity("Fresnes")
    expect(r).not.toBeNull()
    expect(r?.lat).toBeCloseTo(48.75, 1)
  })

  it("trouve toutes les villes du corridor de référence", () => {
    const corridor = [
      "Paris", "Fresnes", "Dijon", "Beaune", "Mâcon", "Lyon",
      "Valence", "Montélimar", "Orange", "Avignon", "Aix-en-Provence", "Marseille",
      "Sens", "Auxerre",
    ]
    for (const city of corridor) {
      const r = geocodeCity(city)
      expect(r, `Ville introuvable : ${city}`).not.toBeNull()
    }
  })
})
