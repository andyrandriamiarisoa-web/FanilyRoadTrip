import type { SourceStatus } from "./types"

// ---------------------------------------------------------------------------
// Seed distance table for known city pairs
// Keys use rounded-to-2-decimal "lat1,lng1->lat2,lng2" format.
// ---------------------------------------------------------------------------

export const SEED_DISTANCES: Record<
  string,
  { distanceKm: number; durationMinutes: number }
> = {
  // Fresnes → Dijon
  "48.75,2.32->47.32,5.04": { distanceKm: 315, durationMinutes: 190 },
  // Dijon → Mâcon
  "47.32,5.04->46.29,4.83": { distanceKm: 75, durationMinutes: 50 },
  // Mâcon → Tain-l'Hermitage (Valence corridor)
  "46.29,4.83->44.93,4.89": { distanceKm: 135, durationMinutes: 85 },
  // Tain-l'Hermitage → Marseille
  "44.93,4.89->43.30,5.37": { distanceKm: 120, durationMinutes: 75 },
  // Marseille → Montélimar
  "43.30,5.37->44.56,4.75": { distanceKm: 195, durationMinutes: 120 },
  // Montélimar → Beaune
  "44.56,4.75->47.05,4.84": { distanceKm: 165, durationMinutes: 100 },
  // Beaune → Sens
  "47.05,4.84->48.19,3.28": { distanceKm: 155, durationMinutes: 95 },
  // Sens → Fresnes
  "48.19,3.28->48.75,2.32": { distanceKm: 120, durationMinutes: 75 },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutingInput {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

export interface RoutingOutput {
  distanceKm: number
  durationMinutes: number
  sourceStatus: SourceStatus
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTo2(n: number): string {
  return n.toFixed(2)
}

function buildSeedKey(from: RoutingInput, to: { lat: number; lng: number }): string {
  return `${roundTo2(from.fromLat)},${roundTo2(from.fromLng)}->${roundTo2(to.lat)},${roundTo2(to.lng)}`
}

function lookupSeed(input: RoutingInput): RoutingOutput | null {
  const key = buildSeedKey(input, { lat: input.toLat, lng: input.toLng })
  const entry = SEED_DISTANCES[key]
  if (entry) {
    return { ...entry, sourceStatus: "seed" }
  }
  // Try reversed key (for return routes)
  const reversedKey = buildSeedKey(
    { fromLat: input.toLat, fromLng: input.toLng, toLat: input.fromLat, toLng: input.fromLng },
    { lat: input.fromLat, lng: input.fromLng }
  )
  const reversed = SEED_DISTANCES[reversedKey]
  if (reversed) {
    return { ...reversed, sourceStatus: "seed" }
  }
  return null
}

// ---------------------------------------------------------------------------
// OSRM live fetch
// ---------------------------------------------------------------------------

async function fetchOsrm(input: RoutingInput): Promise<RoutingOutput | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${input.fromLng},${input.fromLat};${input.toLng},${input.toLat}` +
    `?overview=false&geometries=polyline`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!response.ok) return null

    const data = (await response.json()) as {
      code: string
      routes?: Array<{ distance: number; duration: number }>
    }

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null

    const route = data.routes[0]
    return {
      distanceKm: Math.round(route.distance / 1000),
      durationMinutes: Math.round(route.duration / 60),
      sourceStatus: "verified",
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public routing provider
// ---------------------------------------------------------------------------

/**
 * Fetches routing data for a given origin→destination pair.
 *
 * Resolution order:
 *   1. Live OSRM API call (sourceStatus: "verified")
 *   2. Seed distance table lookup (sourceStatus: "seed")
 *   3. Haversine straight-line fallback with +25% road factor (sourceStatus: "estimated")
 */
export async function getRoute(input: RoutingInput): Promise<RoutingOutput> {
  // 1. Try live OSRM
  const live = await fetchOsrm(input)
  if (live) return live

  // 2. Try seed table
  const seed = lookupSeed(input)
  if (seed) return seed

  // 3. Haversine fallback
  return computeHaversineFallback(input)
}

/**
 * Returns a route estimate using straight-line (haversine) distance plus a
 * road-factor multiplier and a nominal average speed.
 */
export function computeHaversineFallback(input: RoutingInput): RoutingOutput {
  const ROAD_FACTOR = 1.25   // typical detour ratio
  const AVG_SPEED_KMH = 100  // conservative highway average

  const R = 6_371 // Earth radius in km
  const dLat = toRad(input.toLat - input.fromLat)
  const dLng = toRad(input.toLng - input.fromLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(input.fromLat)) *
      Math.cos(toRad(input.toLat)) *
      Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const straightLineKm = R * c
  const distanceKm = Math.round(straightLineKm * ROAD_FACTOR)
  const durationMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60)

  return { distanceKm, durationMinutes, sourceStatus: "estimated" }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
