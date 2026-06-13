import { describe, it, expect } from "vitest"
import {
  createDefaultProfile,
  updateProfile,
  parseProfile,
  safeParseProfile,
  summarizeProfile,
  formatDecimalHour,
  formatWorkDays,
} from "./profile"
import { DEFAULT_FAMILY_PROFILE } from "@/data/default-profile"

describe("createDefaultProfile", () => {
  it("renvoie un profil valide selon le schéma Zod", () => {
    expect(() => parseProfile(createDefaultProfile())).not.toThrow()
  })

  it("démarre à la version 1", () => {
    expect(createDefaultProfile().version).toBe(1)
  })

  it("ne partage pas de référence mutable avec la graine", () => {
    const p = createDefaultProfile()
    p.baby.ageMonths = 99
    expect(DEFAULT_FAMILY_PROFILE.baby.ageMonths).toBe(6)
  })

  it("reflète les contraintes du foyer (§4)", () => {
    const p = createDefaultProfile()
    expect(p.vehicle.model).toBe("Tesla Model S Raven")
    expect(p.medical.requiresFirmMattress).toBe(true)
    expect(p.medical.acRequired).toBe(true)
    expect(p.work.workDays).toEqual(["monday", "tuesday", "wednesday", "thursday"])
    expect(p.baby.noDrivingHours).toEqual([12, 16])
  })
})

describe("updateProfile", () => {
  const now = new Date("2026-06-13T10:00:00.000Z")

  it("incrémente la version et horodate", () => {
    const base = createDefaultProfile()
    const next = updateProfile(base, { baby: { ageMonths: 8 } }, now)
    expect(next.version).toBe(2)
    expect(next.updatedAt).toBe("2026-06-13T10:00:00.000Z")
  })

  it("applique un patch partiel imbriqué sans écraser les autres champs", () => {
    const base = createDefaultProfile()
    const next = updateProfile(base, { baby: { ageMonths: 10 } }, now)
    expect(next.baby.ageMonths).toBe(10)
    expect(next.baby.maxLegMinutes).toBe(base.baby.maxLegMinutes)
    expect(next.vehicle.model).toBe(base.vehicle.model)
  })

  it("ne mute pas le profil d'origine", () => {
    const base = createDefaultProfile()
    const before = base.version
    updateProfile(base, { name: "Autre" }, now)
    expect(base.version).toBe(before)
    expect(base.name).toBe("Profil foyer")
  })

  it("met à jour les jours de télétravail et les booléens de niveau racine", () => {
    const base = createDefaultProfile()
    const next = updateProfile(
      base,
      {
        work: { workDays: ["monday", "friday"] },
        avoidLargeUrbanCores: false,
      },
      now,
    )
    expect(next.work.workDays).toEqual(["monday", "friday"])
    expect(next.avoidLargeUrbanCores).toBe(false)
  })

  it("rejette un patch qui violerait le schéma", () => {
    const base = createDefaultProfile()
    // @ts-expect-error — valeur invalide volontaire pour le test
    expect(() => updateProfile(base, { baby: { ageMonths: "vieux" } }, now)).toThrow()
  })

  it("enchaîne les versions de façon monotone", () => {
    let p = createDefaultProfile()
    p = updateProfile(p, { name: "v2" }, now)
    p = updateProfile(p, { name: "v3" }, now)
    expect(p.version).toBe(3)
  })
})

describe("safeParseProfile", () => {
  it("renvoie le profil si valide", () => {
    expect(safeParseProfile(createDefaultProfile())).not.toBeNull()
  })

  it("renvoie null si invalide", () => {
    expect(safeParseProfile({ id: "x" })).toBeNull()
    expect(safeParseProfile(null)).toBeNull()
  })
})

describe("formatDecimalHour", () => {
  it("formate les heures pleines et les demies", () => {
    expect(formatDecimalHour(8.5)).toBe("8h30")
    expect(formatDecimalHour(19)).toBe("19h")
    expect(formatDecimalHour(2.5)).toBe("2h30")
  })
})

describe("formatWorkDays", () => {
  it("ordonne et abrège les jours", () => {
    expect(formatWorkDays(["thursday", "monday"])).toBe("Lun–Jeu")
  })

  it("gère l'absence de jours", () => {
    expect(formatWorkDays([])).toBe("Aucun")
  })
})

describe("summarizeProfile", () => {
  it("produit une ligne par domaine de contrainte", () => {
    const lines = summarizeProfile(createDefaultProfile())
    expect(lines.map((l) => l.key)).toEqual([
      "vehicle",
      "baby",
      "medical",
      "work",
      "driving",
    ])
  })

  it("reflète les valeurs éditées", () => {
    const p = updateProfile(createDefaultProfile(), { baby: { ageMonths: 12 } })
    const babyLine = summarizeProfile(p).find((l) => l.key === "baby")
    expect(babyLine?.value).toBe("12 mois")
  })
})
