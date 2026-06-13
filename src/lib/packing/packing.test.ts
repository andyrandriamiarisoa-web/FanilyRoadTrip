import { describe, it, expect } from "vitest"
import {
  generatePackingList,
  seasonFromMonth,
  countEssentials,
  type PackingInput,
} from "./packing"

function input(over: Partial<PackingInput> = {}): PackingInput {
  return {
    durationDays: 7,
    season: "summer",
    babyAgeMonths: 6,
    isWorkation: true,
    travelers: 2,
    ...over,
  }
}

const find = (groups: ReturnType<typeof generatePackingList>, key: string) =>
  groups.flatMap((g) => g.items).find((i) => i.key === key)

describe("seasonFromMonth", () => {
  it("mappe le mois sur la saison", () => {
    expect(seasonFromMonth(1)).toBe("winter")
    expect(seasonFromMonth(4)).toBe("spring")
    expect(seasonFromMonth(8)).toBe("summer")
    expect(seasonFromMonth(10)).toBe("autumn")
  })
})

describe("generatePackingList — bébé", () => {
  it("inclut les essentiels bébé pour un nourrisson", () => {
    const groups = generatePackingList(input({ babyAgeMonths: 6 }))
    const baby = groups.find((g) => g.category === "baby")
    expect(baby).toBeDefined()
    expect(find(groups, "baby:lit-parapluie")).toBeDefined()
    expect(find(groups, "baby:biberons")).toBeDefined()
  })

  it("échelonne les couches sur la durée", () => {
    const short = generatePackingList(input({ durationDays: 3 }))
    const long = generatePackingList(input({ durationDays: 10 }))
    expect(find(short, "baby:couches")!.quantity).toBe(18) // 3 × 6
    expect(find(long, "baby:couches")!.quantity).toBe(60) // 10 × 6
  })

  it("omet la section bébé au-delà de 36 mois", () => {
    const groups = generatePackingList(input({ babyAgeMonths: 48 }))
    expect(groups.find((g) => g.category === "baby")).toBeUndefined()
    expect(find(groups, "documents:carnet-de-sante-bebe")).toBeUndefined()
  })
})

describe("generatePackingList — saison", () => {
  it("ajoute crème solaire & chapeau en été", () => {
    const summer = generatePackingList(input({ season: "summer" }))
    expect(find(summer, "baby:creme-solaire-bebe")).toBeDefined()
    expect(find(summer, "health:brumisateur-gourdes")).toBeDefined()
  })

  it("ajoute les couches chaudes en hiver, pas la crème solaire", () => {
    const winter = generatePackingList(input({ season: "winter" }))
    expect(find(winter, "clothing:pulls-couches-chaudes")).toBeDefined()
    expect(find(winter, "baby:creme-solaire-bebe")).toBeUndefined()
  })
})

describe("generatePackingList — workation", () => {
  it("inclut le matériel de télétravail si workation", () => {
    const groups = generatePackingList(input({ isWorkation: true }))
    expect(groups.find((g) => g.category === "workation")).toBeDefined()
    expect(find(groups, "workation:ordinateur-portable-chargeur")).toBeDefined()
  })

  it("omet le télétravail sinon", () => {
    const groups = generatePackingList(input({ isWorkation: false }))
    expect(groups.find((g) => g.category === "workation")).toBeUndefined()
  })
})

describe("generatePackingList — divers", () => {
  it("toujours véhicule + santé + documents", () => {
    const groups = generatePackingList(input())
    for (const cat of ["vehicle", "health", "documents"] as const) {
      expect(groups.find((g) => g.category === cat)).toBeDefined()
    }
  })

  it("plafonne les jeux de vêtements à 7 (lessive)", () => {
    const groups = generatePackingList(input({ durationDays: 15 }))
    expect(find(groups, "clothing:tenues-par-personne")!.quantity).toBe(7)
  })

  it("clés stables et déterminisme", () => {
    const a = generatePackingList(input())
    const b = generatePackingList(input())
    expect(a).toEqual(b)
    expect(countEssentials(a)).toBeGreaterThan(0)
  })
})
