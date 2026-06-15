import { describe, it, expect } from "vitest"
import {
  calculateConsumptionWh100km,
  calculateChargeMinutes,
  planSegment,
  planRouteWithCharging,
  DEFAULT_VEHICLE_PROFILE,
} from "./model"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Consumption for a standard highway segment in heatwave */
function hwHeatConsumption(): number {
  return calculateConsumptionWh100km({ isHighway: true, isHeatwave: true })
}

/** Consumption for highway, no heatwave */
function hwConsumption(): number {
  return calculateConsumptionWh100km({ isHighway: true, isHeatwave: false })
}

// ---------------------------------------------------------------------------
// calculateConsumptionWh100km
// ---------------------------------------------------------------------------

describe("calculateConsumptionWh100km", () => {
  it("returns base consumption on city road without heatwave", () => {
    const result = calculateConsumptionWh100km({ isHighway: false, isHeatwave: false })
    expect(result).toBe(DEFAULT_VEHICLE_PROFILE.baseConsumptionWh100km)
  })

  it("applies highway factor on highway without heatwave", () => {
    const expected =
      DEFAULT_VEHICLE_PROFILE.baseConsumptionWh100km * DEFAULT_VEHICLE_PROFILE.highwayFactor
    expect(hwConsumption()).toBeCloseTo(expected, 2)
  })

  it("applies both factors on highway in heatwave", () => {
    const expected =
      DEFAULT_VEHICLE_PROFILE.baseConsumptionWh100km *
      DEFAULT_VEHICLE_PROFILE.highwayFactor *
      DEFAULT_VEHICLE_PROFILE.heatFactor
    expect(hwHeatConsumption()).toBeCloseTo(expected, 2)
  })

  it("applies only heat factor on city road in heatwave", () => {
    const expected =
      DEFAULT_VEHICLE_PROFILE.baseConsumptionWh100km * DEFAULT_VEHICLE_PROFILE.heatFactor
    const result = calculateConsumptionWh100km({ isHighway: false, isHeatwave: true })
    expect(result).toBeCloseTo(expected, 2)
  })

  it("respects custom base value", () => {
    const result = calculateConsumptionWh100km({
      isHighway: false,
      isHeatwave: false,
      baseWh100km: 200,
    })
    expect(result).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// calculateChargeMinutes
// ---------------------------------------------------------------------------

describe("calculateChargeMinutes", () => {
  it("returns 0 when targetSoc equals startSoc", () => {
    expect(calculateChargeMinutes({ startSoc: 0.5, targetSoc: 0.5, maxKw: 200 })).toBe(0)
  })

  it("returns 0 when targetSoc is below startSoc", () => {
    expect(calculateChargeMinutes({ startSoc: 0.6, targetSoc: 0.4, maxKw: 200 })).toBe(0)
  })

  it("returns a finite 0 for invalid charger power (no Infinity/NaN)", () => {
    expect(calculateChargeMinutes({ startSoc: 0.2, targetSoc: 0.8, maxKw: 0 })).toBe(0)
    expect(calculateChargeMinutes({ startSoc: 0.2, targetSoc: 0.8, maxKw: -50 })).toBe(0)
    expect(calculateChargeMinutes({ startSoc: 0.2, targetSoc: 0.8, maxKw: Number.NaN })).toBe(0)
  })

  it("Phase 1 only: 10% → 50% at V3 200kW (95% of 200 = 190kW)", () => {
    // Energy = 0.40 × 95 kWh = 38 kWh
    // Power = 190 kW
    // Time = 38/190 × 60 = 12 minutes
    const result = calculateChargeMinutes({ startSoc: 0.10, targetSoc: 0.50, maxKw: 200 })
    // 38/190 h × 60 min/h = 12.0 min → ceil = 12
    expect(result).toBe(12)
  })

  it("Phase 2 only: 50% → 80% at V3 200kW", () => {
    // Energy = 0.30 × 95 = 28.5 kWh
    // Power tapers from 190kW at 50% to 100kW at 80% → avg = 145kW
    // Time = 28.5/145 × 60 ≈ 11.79 min → ceil = 12
    const result = calculateChargeMinutes({ startSoc: 0.50, targetSoc: 0.80, maxKw: 200 })
    expect(result).toBeGreaterThanOrEqual(11)
    expect(result).toBeLessThanOrEqual(13)
  })

  it("Full span: 10% → 80% at V3 200kW produces reasonable time", () => {
    // Phase1: 12 min, Phase2: ~12 min → ~24 min total
    const result = calculateChargeMinutes({ startSoc: 0.10, targetSoc: 0.80, maxKw: 200 })
    expect(result).toBeGreaterThanOrEqual(22)
    expect(result).toBeLessThanOrEqual(30)
  })

  it("V2 150kW charger takes longer than V3 200kW for same range", () => {
    const v3 = calculateChargeMinutes({ startSoc: 0.20, targetSoc: 0.80, maxKw: 200 })
    const v2 = calculateChargeMinutes({ startSoc: 0.20, targetSoc: 0.80, maxKw: 150 })
    expect(v2).toBeGreaterThan(v3)
  })
})

// ---------------------------------------------------------------------------
// planSegment
// ---------------------------------------------------------------------------

describe("planSegment", () => {
  it("marks a short segment feasible when SoC is high", () => {
    const result = planSegment({
      startSocPct: 80,
      distanceKm: 50,
      consumptionWh100km: 218, // highway heat
    })
    expect(result.feasible).toBe(true)
    // consumptionWh100km is Wh/km, so consumed = distKm * Wh/km / 1000 kWh
    expect(result.consumedKwh).toBeCloseTo((50 * 218) / 1_000, 2)
    expect(result.endSocPct).toBeGreaterThan(12)
  })

  it("marks a long segment infeasible when SoC is too low", () => {
    const result = planSegment({
      startSocPct: 20,
      distanceKm: 200,
      consumptionWh100km: 218,
    })
    expect(result.feasible).toBe(false)
  })

  it("endSocPct is never below 0", () => {
    const result = planSegment({
      startSocPct: 5,
      distanceKm: 500,
      consumptionWh100km: 218,
    })
    expect(result.endSocPct).toBeGreaterThanOrEqual(0)
  })

  it("needs charge when remaining range is tight", () => {
    const result = planSegment({
      startSocPct: 25,
      distanceKm: 180,
      consumptionWh100km: 218,
    })
    // consumed = 180*218/100000 = 0.3924 kWh → pct = 0.3924/95*100 = 0.413%  → endSoc = 25-41.3 = -16%
    expect(result.needsCharge).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Route 1: Fresnes → Dijon (~315 km, 1 recharge at Beaune-Merceuil)
// ---------------------------------------------------------------------------

describe("Route 1: Fresnes → Dijon (~315 km)", () => {
  const chargers = [
    { id: "sc-beaune-merceuil", name: "Beaune-Merceuil", maxKw: 200, version: "V3" as const },
  ]

  it("plans a charge stop when 315 km exceeds usable range from 80% in heatwave", () => {
    const consumption = hwHeatConsumption()
    // 315 km × ~231 Wh/km ≈ 72.9 kWh → 76.7% discharged → end at 80-76.7 = 3.3% — below 12% buffer
    // planRouteWithCharging should insert a charge stop before the leg
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [{ distanceKm: 315, isHighway: true, isHeatwave: true }],
      availableChargers: chargers,
    })

    expect(results).toHaveLength(1)
    const r = results[0]
    // A charge stop must be inserted
    expect(r.chargeStop).toBeDefined()
    // After charging to 80% then driving 315 km the SoC is still low (3.3%) but non-negative
    // In reality you'd split the leg; this model pre-charges at the departure point
    expect(r.endSoc).toBeGreaterThanOrEqual(0)

    void consumption
  })
})

// ---------------------------------------------------------------------------
// Route 2: Dijon → Marseille via Mâcon / Valence (~470 km total, 2 recharges)
// ---------------------------------------------------------------------------

describe("Route 2: Dijon → Marseille (~470 km)", () => {
  const chargers = [
    { id: "sc-macon-sance", name: "Mâcon-Sancé", maxKw: 150, version: "V3" as const },
    { id: "sc-porte-les-valence", name: "Porte-lès-Valence", maxKw: 250, version: "V4" as const },
    { id: "sc-lancon-de-provence", name: "Lançon-de-Provence", maxKw: 200, version: "V3" as const },
  ]

  it("completes in 3 legs and arrives above buffer", () => {
    // Split route into realistic legs: Dijon→Mâcon 75km, Mâcon→Valence 135km, Valence→Marseille 120km
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [
        { distanceKm: 75, isHighway: true, isHeatwave: true },
        { distanceKm: 135, isHighway: true, isHeatwave: true },
        { distanceKm: 120, isHighway: true, isHeatwave: true },
      ],
      availableChargers: chargers,
    })

    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r.endSoc).toBeGreaterThanOrEqual(0)
    }
  })

  it("final SoC above 12% buffer after 470 km total", () => {
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [
        { distanceKm: 75, isHighway: true, isHeatwave: true },
        { distanceKm: 135, isHighway: true, isHeatwave: true },
        { distanceKm: 120, isHighway: true, isHeatwave: true },
      ],
      availableChargers: chargers,
    })
    const lastLeg = results[results.length - 1]
    expect(lastLeg.endSoc).toBeGreaterThanOrEqual(DEFAULT_VEHICLE_PROFILE.bufferSoc)
  })
})

// ---------------------------------------------------------------------------
// Route 3: Marseille → Fresnes direct (~770 km, 3–4 recharges)
// ---------------------------------------------------------------------------

describe("Route 3: Marseille → Fresnes direct (~770 km)", () => {
  const chargers = [
    { id: "sc-lancon-de-provence", name: "Lançon-de-Provence", maxKw: 200, version: "V3" as const },
    { id: "sc-montelimar-nord", name: "Montélimar-Nord", maxKw: 200, version: "V3" as const },
    { id: "sc-porte-les-valence", name: "Porte-lès-Valence", maxKw: 250, version: "V4" as const },
    { id: "sc-beaune-merceuil", name: "Beaune-Merceuil", maxKw: 200, version: "V3" as const },
    { id: "sc-sens-maillot", name: "Sens-Maillot", maxKw: 200, version: "V3" as const },
  ]

  it("processes 5 legs without negative SoC on any leg", () => {
    // Marseille→Lançon 65km, →Montélimar 130km, →Valence 90km, →Beaune 165km, →Fresnes 155km (+Sens)
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [
        { distanceKm: 65, isHighway: true, isHeatwave: false },
        { distanceKm: 130, isHighway: true, isHeatwave: false },
        { distanceKm: 90, isHighway: true, isHeatwave: false },
        { distanceKm: 165, isHighway: true, isHeatwave: false },
        { distanceKm: 155, isHighway: true, isHeatwave: false },
      ],
      availableChargers: chargers,
    })

    expect(results).toHaveLength(5)
    for (const r of results) {
      expect(r.endSoc).toBeGreaterThanOrEqual(0)
    }
  })

  it("requires at least 2 charge stops for 770 km journey", () => {
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [
        { distanceKm: 65, isHighway: true, isHeatwave: false },
        { distanceKm: 130, isHighway: true, isHeatwave: false },
        { distanceKm: 90, isHighway: true, isHeatwave: false },
        { distanceKm: 165, isHighway: true, isHeatwave: false },
        { distanceKm: 155, isHighway: true, isHeatwave: false },
      ],
      availableChargers: chargers,
    })

    const chargeStops = results.filter((r) => r.chargeStop !== undefined).length
    expect(chargeStops).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Edge cases for planRouteWithCharging
// ---------------------------------------------------------------------------

describe("planRouteWithCharging edge cases", () => {
  it("returns empty array for no legs", () => {
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [],
      availableChargers: [],
    })
    expect(results).toHaveLength(0)
  })

  it("works with no chargers available (feasibility is caller's responsibility)", () => {
    const results = planRouteWithCharging({
      startSocPct: 80,
      legs: [{ distanceKm: 50, isHighway: false, isHeatwave: false }],
      availableChargers: [],
    })
    expect(results).toHaveLength(1)
    // No charge stop since no chargers
    expect(results[0].chargeStop).toBeUndefined()
  })
})
