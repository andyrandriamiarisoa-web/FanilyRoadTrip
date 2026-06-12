import type { LodgingOption } from "@/types"

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

export interface ScoringWeights {
  /** Lower price is better */
  price: number
  /** Higher rating is better */
  rating: number
  /** AC mandatory in heatwave (medical + baby) */
  ac: number
  /** On-site or nearby parking */
  parking: number
  /** Firm mattress available (medical requirement) */
  firmMattress: number
  /** Good connectivity for remote-work days */
  connectivity: number
  /** Proximity to city centre or public transport */
  location: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 0.25,
  rating: 0.20,
  ac: 0.15,
  firmMattress: 0.15,
  parking: 0.10,
  connectivity: 0.10,
  location: 0.05,
}

// ---------------------------------------------------------------------------
// Scoring result
// ---------------------------------------------------------------------------

export interface ScoringResult {
  /** Final 0–100 weighted score */
  score: number
  /** Contribution of each dimension (weighted component score 0–100) */
  breakdown: Record<string, number>
}

// ---------------------------------------------------------------------------
// scoreLodging
// ---------------------------------------------------------------------------

/**
 * Scores a lodging option against its peer set using a weighted multi-criteria
 * model.
 *
 * Each dimension is normalised to 0–100:
 *
 *   price        — cheapest in set = 100, most expensive = 0 (linear)
 *   rating       — rating is scaled as (rating - 1) / (5 - 1) × 100; absent = 50
 *   ac           — present = 100, absent = 0 (boosted when isHeatwave)
 *   parking      — present = 100, absent = 0
 *   firmMattress — not in toConfirm list = 100 (confirmed / not required),
 *                  in toConfirm list = 50 (needs verification)
 *   connectivity — derived from tier + amenities; isWorkDay boosts weight
 *   location     — tier "best" = 80, "character" = 60, "eco" = 40
 *
 * The final score is sum(dimension × weight) capped at 100.
 */
export function scoreLodging(opts: {
  option: LodgingOption
  allOptions: LodgingOption[]
  isWorkDay: boolean
  isHeatwave: boolean
  weights?: Partial<ScoringWeights>
}): ScoringResult {
  const { option, allOptions, isWorkDay, isHeatwave } = opts

  // Merge caller weights with defaults
  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...opts.weights }

  // When it's a work day, connectivity matters more and we re-normalise
  if (isWorkDay) {
    const boost = 0.05
    w.connectivity = Math.min(w.connectivity + boost, 1)
    // Reduce least-critical dimension to keep sum = 1
    w.location = Math.max(w.location - boost, 0)
  }

  // When it's a heatwave, AC criticality increases and parking decreases
  if (isHeatwave) {
    const boost = 0.05
    w.ac = Math.min(w.ac + boost, 1)
    w.parking = Math.max(w.parking - boost, 0)
  }

  // Re-normalise weights so they always sum to 1 (floating-point safety)
  const weightSum = Object.values(w).reduce((a, b) => a + b, 0)
  const normW: ScoringWeights = {
    price: w.price / weightSum,
    rating: w.rating / weightSum,
    ac: w.ac / weightSum,
    firmMattress: w.firmMattress / weightSum,
    parking: w.parking / weightSum,
    connectivity: w.connectivity / weightSum,
    location: w.location / weightSum,
  }

  // -----------------------------------------------------------------
  // Dimension: price (relative within peer set)
  // -----------------------------------------------------------------
  // Normalise by price-per-night to allow fair comparison across stays of
  // different length.
  const pricePerNight = (o: LodgingOption) =>
    o.nights > 0 ? o.priceTotal / o.nights : o.priceTotal

  const prices = allOptions.map(pricePerNight)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceScore =
    maxPrice === minPrice
      ? 100
      : 100 - ((pricePerNight(option) - minPrice) / (maxPrice - minPrice)) * 100

  // -----------------------------------------------------------------
  // Dimension: rating (0–5 scale → 0–100)
  // -----------------------------------------------------------------
  const ratingScore =
    option.rating !== undefined
      ? Math.max(0, Math.min(100, ((option.rating - 1) / 4) * 100))
      : 50  // neutral when unknown

  // -----------------------------------------------------------------
  // Dimension: AC
  // -----------------------------------------------------------------
  const acScore = option.amenities.ac ? 100 : 0

  // -----------------------------------------------------------------
  // Dimension: parking
  // -----------------------------------------------------------------
  const parkingScore = option.amenities.parking ? 100 : 0

  // -----------------------------------------------------------------
  // Dimension: firm mattress
  // Treat "not in toConfirm" as confirmed-available = 100
  // "in toConfirm" = still needs confirmation = 50
  // -----------------------------------------------------------------
  const firmMattressScore = option.toConfirm.includes("firmMattress") ? 50 : 100

  // -----------------------------------------------------------------
  // Dimension: connectivity
  // Use amenities.evCharger as a proxy for tech-forward property (+bonus),
  // and desk availability as a direct work-readiness signal.
  // -----------------------------------------------------------------
  let connectivityScore = 40  // baseline
  if (option.amenities.desk) connectivityScore += 35
  if (option.amenities.evCharger) connectivityScore += 15
  if (!option.toConfirm.includes("desk32")) connectivityScore += 10
  connectivityScore = Math.min(connectivityScore, 100)

  // -----------------------------------------------------------------
  // Dimension: location quality (inferred from tier)
  // -----------------------------------------------------------------
  const locationScore =
    option.tier === "best" ? 80 : option.tier === "character" ? 60 : 40

  // -----------------------------------------------------------------
  // Weighted aggregate
  // -----------------------------------------------------------------
  const weightedPrice = priceScore * normW.price
  const weightedRating = ratingScore * normW.rating
  const weightedAc = acScore * normW.ac
  const weightedParking = parkingScore * normW.parking
  const weightedFirmMattress = firmMattressScore * normW.firmMattress
  const weightedConnectivity = connectivityScore * normW.connectivity
  const weightedLocation = locationScore * normW.location

  const rawScore =
    weightedPrice +
    weightedRating +
    weightedAc +
    weightedParking +
    weightedFirmMattress +
    weightedConnectivity +
    weightedLocation

  const score = Math.round(Math.min(100, Math.max(0, rawScore)))

  return {
    score,
    breakdown: {
      price: Math.round(weightedPrice),
      rating: Math.round(weightedRating),
      ac: Math.round(weightedAc),
      parking: Math.round(weightedParking),
      firmMattress: Math.round(weightedFirmMattress),
      connectivity: Math.round(weightedConnectivity),
      location: Math.round(weightedLocation),
    },
  }
}

// ---------------------------------------------------------------------------
// rankLodgings — convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Scores all options in a set and returns them sorted by score descending.
 * Does NOT filter out any options — caller decides minimum threshold.
 */
export function rankLodgings(opts: {
  options: LodgingOption[]
  isWorkDay: boolean
  isHeatwave: boolean
  weights?: Partial<ScoringWeights>
}): Array<LodgingOption & { score: number; scoreBreakdown: Record<string, number> }> {
  const { options, isWorkDay, isHeatwave, weights } = opts

  const scored = options.map((option) => {
    const { score, breakdown } = scoreLodging({
      option,
      allOptions: options,
      isWorkDay,
      isHeatwave,
      weights,
    })
    return { ...option, score, scoreBreakdown: breakdown }
  })

  return scored.sort((a, b) => b.score - a.score)
}
