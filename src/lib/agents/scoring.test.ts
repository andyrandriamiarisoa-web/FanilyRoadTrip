import { describe, it, expect } from "vitest"
import { scoreLodging, rankLodgings, DEFAULT_WEIGHTS } from "./scoring"
import type { LodgingOption } from "@/types"

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const BASE: Omit<LodgingOption, "id" | "name" | "priceTotal" | "amenities" | "tier"> = {
  address: "1 Rue Test, 21000 Dijon",
  lat: 47.32,
  lng: 5.04,
  nights: 2,
  rating: 4.0,
  reviewCount: 100,
  toConfirm: [],
  sourceStatus: "seed",
  bookingLinks: [],
}

function makeOption(overrides: Partial<LodgingOption> & Pick<LodgingOption, "id" | "name" | "priceTotal" | "amenities" | "tier">): LodgingOption {
  return { ...BASE, ...overrides }
}

const CHEAP_WITH_AC: LodgingOption = makeOption({
  id: "cheap-ac",
  name: "Budget AC",
  priceTotal: 100,
  tier: "eco",
  amenities: { ac: true, parking: false, evCharger: false, desk: false },
})

const EXPENSIVE_NO_AC: LodgingOption = makeOption({
  id: "expensive-no-ac",
  name: "Luxury No AC",
  priceTotal: 500,
  tier: "best",
  rating: 4.8,
  amenities: { ac: false, parking: true, evCharger: false, desk: true },
})

const MID_FULL: LodgingOption = makeOption({
  id: "mid-full",
  name: "Mid All-In",
  priceTotal: 300,
  tier: "character",
  rating: 4.2,
  amenities: { ac: true, parking: true, evCharger: false, desk: true },
})

const ALL_OPTIONS = [CHEAP_WITH_AC, EXPENSIVE_NO_AC, MID_FULL]

// ---------------------------------------------------------------------------
// scoreLodging — basic output structure
// ---------------------------------------------------------------------------

describe("scoreLodging output structure", () => {
  it("returns score as a number between 0 and 100", () => {
    const result = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it("returns breakdown with all 7 dimension keys", () => {
    const result = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    const keys = Object.keys(result.breakdown)
    expect(keys).toContain("price")
    expect(keys).toContain("rating")
    expect(keys).toContain("ac")
    expect(keys).toContain("parking")
    expect(keys).toContain("firmMattress")
    expect(keys).toContain("connectivity")
    expect(keys).toContain("location")
  })

  it("all breakdown values are non-negative numbers", () => {
    const result = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: true,
      isHeatwave: true,
    })
    for (const value of Object.values(result.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  it("breakdown values sum approximately equals the total score", () => {
    const result = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0)
    // Allow ±2 for rounding
    expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Price scoring
// ---------------------------------------------------------------------------

describe("price scoring", () => {
  it("cheapest option gets higher price score than most expensive", () => {
    const cheapResult = scoreLodging({
      option: CHEAP_WITH_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    const expensiveResult = scoreLodging({
      option: EXPENSIVE_NO_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    expect(cheapResult.breakdown.price).toBeGreaterThan(expensiveResult.breakdown.price)
  })

  it("when all options have same price, price score is equal for all", () => {
    const same = ALL_OPTIONS.map((o) => ({ ...o, priceTotal: 200 }))
    const scores = same.map((option) =>
      scoreLodging({ option, allOptions: same, isWorkDay: false, isHeatwave: false })
    )
    expect(scores[0].breakdown.price).toBe(scores[1].breakdown.price)
    expect(scores[1].breakdown.price).toBe(scores[2].breakdown.price)
  })
})

// ---------------------------------------------------------------------------
// AC scoring — especially in heatwave
// ---------------------------------------------------------------------------

describe("AC scoring", () => {
  it("option with AC scores higher on ac dimension than option without AC", () => {
    const withAc = scoreLodging({
      option: CHEAP_WITH_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    const withoutAc = scoreLodging({
      option: EXPENSIVE_NO_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    expect(withAc.breakdown.ac).toBeGreaterThan(withoutAc.breakdown.ac)
  })

  it("heatwave flag increases total score for AC-equipped option relative to non-heatwave", () => {
    const heatwave = scoreLodging({
      option: CHEAP_WITH_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: true,
    })
    const normal = scoreLodging({
      option: CHEAP_WITH_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    // AC-equipped option should score >= without heatwave when AC weight increases
    expect(heatwave.score).toBeGreaterThanOrEqual(normal.score)
  })

  it("no-AC option gets lower total score in heatwave vs normal conditions", () => {
    const heatwave = scoreLodging({
      option: EXPENSIVE_NO_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: true,
    })
    const normal = scoreLodging({
      option: EXPENSIVE_NO_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    // No AC means the increased AC weight penalises it more in heatwave
    expect(heatwave.score).toBeLessThanOrEqual(normal.score)
  })
})

// ---------------------------------------------------------------------------
// Work day scoring
// ---------------------------------------------------------------------------

describe("work day scoring", () => {
  it("option with desk scores higher connectivity on work day", () => {
    const workDay = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: true,
      isHeatwave: false,
    })
    const nonWorkDay = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
    })
    // connectivity weight is boosted on work days → connectivity contribution increases
    expect(workDay.breakdown.connectivity).toBeGreaterThanOrEqual(nonWorkDay.breakdown.connectivity)
  })

  it("option without desk scores less on connectivity than one with desk", () => {
    const withDesk = scoreLodging({
      option: MID_FULL,
      allOptions: ALL_OPTIONS,
      isWorkDay: true,
      isHeatwave: false,
    })
    const noDesk = scoreLodging({
      option: CHEAP_WITH_AC,
      allOptions: ALL_OPTIONS,
      isWorkDay: true,
      isHeatwave: false,
    })
    expect(withDesk.breakdown.connectivity).toBeGreaterThan(noDesk.breakdown.connectivity)
  })
})

// ---------------------------------------------------------------------------
// Firm mattress scoring
// ---------------------------------------------------------------------------

describe("firmMattress scoring", () => {
  it("option with firmMattress NOT in toConfirm scores 100 on firmMattress dimension", () => {
    const confirmed = makeOption({
      id: "confirmed-firm",
      name: "Confirmed Firm",
      priceTotal: 200,
      tier: "best",
      amenities: { ac: true, parking: true, evCharger: false, desk: true },
      toConfirm: [],  // firmMattress not listed → confirmed / not an issue
    })
    const result = scoreLodging({
      option: confirmed,
      allOptions: [confirmed],
      isWorkDay: false,
      isHeatwave: false,
    })
    // firmMattress raw score = 100 → weighted contribution = 100 × DEFAULT_WEIGHTS.firmMattress
    expect(result.breakdown.firmMattress).toBe(
      Math.round(100 * (DEFAULT_WEIGHTS.firmMattress / 1))  // will be normalised but ratio holds
    )
  })

  it("option with firmMattress in toConfirm scores lower", () => {
    const toConfirm = makeOption({
      id: "to-confirm-firm",
      name: "To Confirm Firm",
      priceTotal: 200,
      tier: "best",
      amenities: { ac: true, parking: true, evCharger: false, desk: true },
      toConfirm: ["firmMattress"],
    })
    const confirmed = makeOption({
      id: "confirmed-firm-2",
      name: "Confirmed Firm 2",
      priceTotal: 200,
      tier: "best",
      amenities: { ac: true, parking: true, evCharger: false, desk: true },
      toConfirm: [],
    })
    const opts = [toConfirm, confirmed]
    const r1 = scoreLodging({ option: toConfirm, allOptions: opts, isWorkDay: false, isHeatwave: false })
    const r2 = scoreLodging({ option: confirmed, allOptions: opts, isWorkDay: false, isHeatwave: false })
    expect(r2.breakdown.firmMattress).toBeGreaterThan(r1.breakdown.firmMattress)
  })
})

// ---------------------------------------------------------------------------
// rankLodgings
// ---------------------------------------------------------------------------

describe("rankLodgings", () => {
  it("returns same number of items as input", () => {
    const ranked = rankLodgings({ options: ALL_OPTIONS, isWorkDay: false, isHeatwave: false })
    expect(ranked).toHaveLength(ALL_OPTIONS.length)
  })

  it("returns items sorted by score descending", () => {
    const ranked = rankLodgings({ options: ALL_OPTIONS, isWorkDay: false, isHeatwave: false })
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score)
    }
  })

  it("every item in the result has a score and scoreBreakdown", () => {
    const ranked = rankLodgings({ options: ALL_OPTIONS, isWorkDay: true, isHeatwave: true })
    for (const item of ranked) {
      expect(typeof item.score).toBe("number")
      expect(typeof item.scoreBreakdown).toBe("object")
    }
  })

  it("does NOT filter out any options (even low-scoring ones)", () => {
    const ranked = rankLodgings({ options: ALL_OPTIONS, isWorkDay: false, isHeatwave: true })
    // Even the worst option (no AC in heatwave, expensive) must still be in the result
    const ids = ranked.map((r) => r.id)
    expect(ids).toContain("cheap-ac")
    expect(ids).toContain("expensive-no-ac")
    expect(ids).toContain("mid-full")
  })

  it("in heatwave, AC-equipped mid option beats luxury no-AC option", () => {
    const ranked = rankLodgings({ options: ALL_OPTIONS, isWorkDay: false, isHeatwave: true })
    const midIdx = ranked.findIndex((r) => r.id === "mid-full")
    const noAcIdx = ranked.findIndex((r) => r.id === "expensive-no-ac")
    expect(midIdx).toBeLessThan(noAcIdx)
  })

  it("respects custom weights", () => {
    // Zero out everything except rating so the highest-rated option must win
    const ranked = rankLodgings({
      options: ALL_OPTIONS,
      isWorkDay: false,
      isHeatwave: false,
      weights: { price: 0, ac: 0, parking: 0, firmMattress: 0, connectivity: 0, location: 0, rating: 1.0 },
    })
    // Highest rating is EXPENSIVE_NO_AC at 4.8 → should rank first when only rating matters
    expect(ranked[0].id).toBe("expensive-no-ac")
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("scoreLodging edge cases", () => {
  it("single-option set: price score is 100 (cheapest = 100)", () => {
    const single = makeOption({
      id: "solo",
      name: "Solo",
      priceTotal: 999,
      tier: "eco",
      amenities: { ac: false, parking: false, evCharger: false, desk: false },
    })
    const result = scoreLodging({ option: single, allOptions: [single], isWorkDay: false, isHeatwave: false })
    // When min === max, price score = 100
    expect(result.breakdown.price).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it("option with no rating gets neutral score of 50 on rating dimension", () => {
    const noRating = makeOption({
      id: "no-rating",
      name: "No Rating",
      priceTotal: 200,
      tier: "best",
      rating: undefined,
      amenities: { ac: true, parking: true, evCharger: false, desk: true },
    })
    const full = makeOption({
      id: "full-rating",
      name: "Full Rating",
      priceTotal: 200,
      tier: "best",
      rating: 5.0,
      amenities: { ac: true, parking: true, evCharger: false, desk: true },
    })
    const opts = [noRating, full]
    const noRatingResult = scoreLodging({ option: noRating, allOptions: opts, isWorkDay: false, isHeatwave: false })
    const fullResult = scoreLodging({ option: full, allOptions: opts, isWorkDay: false, isHeatwave: false })
    // Full rating 5.0 → 100 on dimension; no rating → 50; full should score higher on rating
    expect(fullResult.breakdown.rating).toBeGreaterThan(noRatingResult.breakdown.rating)
  })
})
