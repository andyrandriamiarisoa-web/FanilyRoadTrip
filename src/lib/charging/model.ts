/**
 * Tesla Model S Raven charging model.
 *
 * All SoC values are expressed as fractions 0–1 internally unless a function
 * signature states "Pct" (0–100).
 */

export const DEFAULT_VEHICLE_PROFILE = {
  usableKwh: 95,
  baseConsumptionWh100km: 185,
  highwayFactor: 1.18,   // at 130 km/h
  heatFactor: 1.06,      // canicule
  bufferSoc: 0.12,
  targetChargeSoc: 0.80,
  startChargeSoc: 0.10,
  maxChargingKwV3: 200,
  maxChargingKwV2: 150,
} as const

// ---------------------------------------------------------------------------
// calculateConsumptionWh100km
// ---------------------------------------------------------------------------

/**
 * Returns the effective energy consumption in Wh/100 km for a given segment,
 * applying highway and heat-wave multipliers on top of the base value.
 */
export function calculateConsumptionWh100km(opts: {
  isHighway: boolean
  isHeatwave: boolean
  baseWh100km?: number
  highwayFactor?: number
  heatFactor?: number
}): number {
  const base = opts.baseWh100km ?? DEFAULT_VEHICLE_PROFILE.baseConsumptionWh100km
  const hwFactor = opts.highwayFactor ?? DEFAULT_VEHICLE_PROFILE.highwayFactor
  const heatFactor = opts.heatFactor ?? DEFAULT_VEHICLE_PROFILE.heatFactor

  let consumption = base
  if (opts.isHighway) consumption *= hwFactor
  if (opts.isHeatwave) consumption *= heatFactor
  return consumption
}

// ---------------------------------------------------------------------------
// calculateChargeMinutes — piecewise charging curve
// ---------------------------------------------------------------------------

/**
 * Estimates the time in minutes to charge from `startSoc` to `targetSoc`
 * using a two-phase piecewise model:
 *
 *   Phase 1 — 10 % → 50 %: constant power at 95 % of maxKw
 *   Phase 2 — 50 % → 80 %: power tapers linearly from 95 % maxKw → 50 % maxKw
 *
 * For any range that spans both phases the function calculates each phase
 * separately and sums the times.
 */
export function calculateChargeMinutes(opts: {
  startSoc: number   // 0–1
  targetSoc: number  // 0–1
  maxKw: number      // charger peak power
  usableKwh?: number
}): number {
  const usableKwh = opts.usableKwh ?? DEFAULT_VEHICLE_PROFILE.usableKwh
  const { startSoc, targetSoc, maxKw } = opts

  if (targetSoc <= startSoc) return 0

  // Phase boundaries (as fractions)
  const PHASE1_END = 0.50  // end of fast phase
  const PHASE2_END = 0.80  // model only covers up to 80 %

  // Clamp to model range
  const start = Math.max(startSoc, 0)
  const end = Math.min(targetSoc, PHASE2_END)

  if (end <= start) return 0

  const powerPhase1Kw = maxKw * 0.95
  const powerPhase2StartKw = maxKw * 0.95
  const powerPhase2EndKw = maxKw * 0.50

  let minutes = 0

  // Phase 1 contribution
  if (start < PHASE1_END) {
    const phaseStart = start
    const phaseEnd = Math.min(end, PHASE1_END)
    const energyKwh = (phaseEnd - phaseStart) * usableKwh
    minutes += (energyKwh / powerPhase1Kw) * 60
  }

  // Phase 2 contribution — use average power for the slice
  if (end > PHASE1_END) {
    const phaseStart = Math.max(start, PHASE1_END)
    const phaseEnd = end
    const energyKwh = (phaseEnd - phaseStart) * usableKwh

    // fraction of progress through Phase 2 (0 at 50 %, 1 at 80 %)
    const phase2Range = PHASE2_END - PHASE1_END
    const tStart = (phaseStart - PHASE1_END) / phase2Range
    const tEnd = (phaseEnd - PHASE1_END) / phase2Range

    // average power over this slice using linear interpolation
    const powerAtStart = powerPhase2StartKw + tStart * (powerPhase2EndKw - powerPhase2StartKw)
    const powerAtEnd = powerPhase2StartKw + tEnd * (powerPhase2EndKw - powerPhase2StartKw)
    const avgPowerKw = (powerAtStart + powerAtEnd) / 2

    minutes += (energyKwh / avgPowerKw) * 60
  }

  return Math.ceil(minutes)
}

// ---------------------------------------------------------------------------
// planSegment
// ---------------------------------------------------------------------------

/**
 * Determines whether a single segment can be driven from `startSocPct`,
 * the resulting SoC on arrival, total energy consumed, and whether a charge
 * stop is required before starting the segment.
 */
export function planSegment(opts: {
  startSocPct: number       // 0–100
  distanceKm: number
  consumptionWh100km: number
  usableKwh?: number
  bufferSocPct?: number     // 12 %
}): {
  feasible: boolean
  endSocPct: number
  consumedKwh: number
  needsCharge: boolean
} {
  const usableKwh = opts.usableKwh ?? DEFAULT_VEHICLE_PROFILE.usableKwh
  const bufferPct = opts.bufferSocPct ?? (DEFAULT_VEHICLE_PROFILE.bufferSoc * 100)

  // consumptionWh100km is Wh per km (despite the name); convert Wh → kWh with /1000
  const consumedKwh = (opts.distanceKm * opts.consumptionWh100km) / 1_000
  const consumedPct = (consumedKwh / usableKwh) * 100

  const endSocPct = opts.startSocPct - consumedPct
  const feasible = endSocPct >= bufferPct
  const needsCharge = endSocPct < bufferPct + 10  // plan a charge if close to buffer

  return {
    feasible,
    endSocPct: Math.max(endSocPct, 0),
    consumedKwh,
    needsCharge,
  }
}

// ---------------------------------------------------------------------------
// planRouteWithCharging
// ---------------------------------------------------------------------------

interface LegInput {
  distanceKm: number
  isHighway: boolean
  isHeatwave: boolean
}

interface ChargerInput {
  id: string
  name: string
  maxKw: number
  version: "V2" | "V3" | "V4"
}

interface LegResult {
  legIndex: number
  startSoc: number  // 0–1
  endSoc: number    // 0–1
  chargeStop?: {
    chargerId: string
    chargerName: string
    socOnArrival: number   // 0–1
    socOnDeparture: number // 0–1
    chargeMinutes: number
    energyAddedKwh: number
  }
}

/**
 * Plans a multi-leg route by inserting charge stops whenever the SoC would
 * fall to or below the buffer level.
 *
 * Strategy:
 *   - Iterate legs in order carrying the current SoC.
 *   - Before each leg, check if the energy available (above buffer) is enough
 *     to cover the leg.
 *   - If not, schedule a charge at the best available charger (highest maxKw)
 *     up to `targetSocPct`.
 *   - The charger is assumed to be located "at the start of this leg" (i.e.,
 *     the previous stop).  In a real implementation the charger would be
 *     geocoded along the route; here we use the simplest model that satisfies
 *     the constraint.
 */
export function planRouteWithCharging(opts: {
  startSocPct: number
  legs: LegInput[]
  availableChargers: ChargerInput[]
  targetSocPct?: number
  bufferSocPct?: number
  usableKwh?: number
}): LegResult[] {
  const usableKwh = opts.usableKwh ?? DEFAULT_VEHICLE_PROFILE.usableKwh
  const targetSocPct = opts.targetSocPct ?? (DEFAULT_VEHICLE_PROFILE.targetChargeSoc * 100)
  const bufferSocPct = opts.bufferSocPct ?? (DEFAULT_VEHICLE_PROFILE.bufferSoc * 100)

  // Pick the best charger by maxKw
  const bestCharger =
    opts.availableChargers.length > 0
      ? opts.availableChargers.reduce((best, c) => (c.maxKw > best.maxKw ? c : best))
      : null

  let currentSocPct = opts.startSocPct
  const results: LegResult[] = []

  for (let i = 0; i < opts.legs.length; i++) {
    const leg = opts.legs[i]
    const consumptionWh100km = calculateConsumptionWh100km({
      isHighway: leg.isHighway,
      isHeatwave: leg.isHeatwave,
    })
    // consumptionWh100km is Wh per km; convert to kWh with /1000
    const consumedKwh = (leg.distanceKm * consumptionWh100km) / 1_000
    const consumedPct = (consumedKwh / usableKwh) * 100

    const socAfterLeg = currentSocPct - consumedPct
    const result: LegResult = {
      legIndex: i,
      startSoc: currentSocPct / 100,
      endSoc: Math.max(socAfterLeg, 0) / 100,
    }

    // Check if we need a charge stop before this leg
    if (socAfterLeg < bufferSocPct && bestCharger !== null) {
      const socOnArrivalFrac = currentSocPct / 100
      const socOnDepartureFrac = targetSocPct / 100
      const chargeMinutes = calculateChargeMinutes({
        startSoc: socOnArrivalFrac,
        targetSoc: socOnDepartureFrac,
        maxKw: bestCharger.maxKw,
        usableKwh,
      })
      const energyAddedKwh = (socOnDepartureFrac - socOnArrivalFrac) * usableKwh

      result.chargeStop = {
        chargerId: bestCharger.id,
        chargerName: bestCharger.name,
        socOnArrival: socOnArrivalFrac,
        socOnDeparture: socOnDepartureFrac,
        chargeMinutes,
        energyAddedKwh,
      }

      // Update SoC after charging, then drive the leg
      const socAfterCharge = targetSocPct
      const socAfterLegCharged = socAfterCharge - consumedPct
      result.startSoc = socAfterCharge / 100
      result.endSoc = Math.max(socAfterLegCharged, 0) / 100
      currentSocPct = socAfterLegCharged
    } else {
      currentSocPct = socAfterLeg
    }

    results.push(result)
  }

  return results
}
