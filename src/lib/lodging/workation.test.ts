import { describe, it, expect } from "vitest"
import {
  assessWorkation,
  getCoverageForCommune,
  rankForWorkationNight,
  recommendForWorkationNight,
  type WorkationContext,
} from "./workation"
import type { LodgingOption } from "@/types"

function lodging(overrides: Partial<LodgingOption> = {}): LodgingOption {
  return {
    id: "x",
    name: "Test",
    address: "1 rue Test, 21000 Dijon",
    lat: 47.3,
    lng: 5.0,
    priceTotal: 400,
    nights: 2,
    rating: 4,
    amenities: { ac: true, parking: true, evCharger: false, desk: true },
    toConfirm: [],
    sourceStatus: "seed",
    tier: "best",
    ...overrides,
  }
}

const ctx = (over: Partial<WorkationContext> = {}): WorkationContext => ({
  requiresDeskCm: 120,
  requiresFiber: true,
  fallback5G: true,
  acRequired: true,
  firmMattressRequired: true,
  coverageQuality: "good",
  ...over,
})

describe("getCoverageForCommune", () => {
  it("trouve une commune malgré accents/casse/apostrophe", () => {
    expect(getCoverageForCommune("dijon")?.quality).toBe("good")
    expect(getCoverageForCommune("Tain-l'Hermitage")?.quality).toBe("fair")
    expect(getCoverageForCommune("MONTÉLIMAR")?.quality).toBe("excellent")
  })
  it("renvoie null si inconnue", () => {
    expect(getCoverageForCommune("Tombouctou")).toBeNull()
  })
})

describe("assessWorkation", () => {
  it("hébergement pleinement conforme", () => {
    const a = assessWorkation(lodging(), ctx())
    expect(a.overall).toBe("conforme")
    expect(a.conformityScore).toBe(100)
  })

  it("sans climatisation → non conforme (médical)", () => {
    const a = assessWorkation(
      lodging({ amenities: { ac: false, parking: true, evCharger: false, desk: true } }),
      ctx(),
    )
    expect(a.overall).toBe("non conforme")
    expect(a.criteria.find((c) => c.key === "ac")?.status).toBe("non conforme")
  })

  it("sans bureau → non conforme", () => {
    const a = assessWorkation(
      lodging({ amenities: { ac: true, parking: true, evCharger: false, desk: false } }),
      ctx(),
    )
    expect(a.overall).toBe("non conforme")
  })

  it("5G insuffisante → non conforme connectivité", () => {
    const a = assessWorkation(lodging(), ctx({ coverageQuality: "insufficient" }))
    expect(a.criteria.find((c) => c.key === "connectivity")?.status).toBe("non conforme")
    expect(a.overall).toBe("non conforme")
  })

  it("éléments à confirmer → statut « à confirmer », jamais éliminés", () => {
    const a = assessWorkation(
      lodging({ toConfirm: ["firmMattress", "desk32"] }),
      ctx({ coverageQuality: "fair" }),
    )
    expect(a.overall).toBe("à confirmer")
    expect(a.conformityScore).toBeGreaterThan(0)
    expect(a.conformityScore).toBeLessThan(100)
  })

  it("couverture inconnue → connectivité à confirmer", () => {
    const a = assessWorkation(lodging(), ctx({ coverageQuality: undefined }))
    expect(a.criteria.find((c) => c.key === "connectivity")?.status).toBe("à confirmer")
  })
})

describe("rankForWorkationNight — classe sans exclure", () => {
  const conform = lodging({ id: "ok", toConfirm: [] })
  const toConfirm = lodging({ id: "maybe", toConfirm: ["firmMattress", "desk32"] })
  const noAc = lodging({
    id: "bad",
    amenities: { ac: false, parking: true, evCharger: false, desk: true },
  })

  const ranked = rankForWorkationNight([noAc, toConfirm, conform], () => ctx())

  it("conserve TOUS les hébergements (anti-pattern : pas d'exclusion)", () => {
    expect(ranked).toHaveLength(3)
    expect(ranked.map((r) => r.lodging.id).sort()).toEqual(["bad", "maybe", "ok"])
  })

  it("classe le conforme en tête et le non conforme en dernier", () => {
    expect(ranked[0].lodging.id).toBe("ok")
    expect(ranked[2].lodging.id).toBe("bad")
  })

  it("recommande le meilleur conforme, jamais le non conforme s'il existe mieux", () => {
    const rec = recommendForWorkationNight(ranked)
    expect(rec?.lodging.id).toBe("ok")
    expect(rec?.assessment.overall).not.toBe("non conforme")
  })

  it("si tout est non conforme, recommande quand même (signalé), sans rien masquer", () => {
    const allBad = rankForWorkationNight([noAc], () => ctx())
    const rec = recommendForWorkationNight(allBad)
    expect(rec?.lodging.id).toBe("bad")
    expect(rec?.assessment.overall).toBe("non conforme")
  })
})
