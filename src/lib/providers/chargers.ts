import type { SourceStatus } from "./types"
import superchargersData from "@/data/superchargers.json"

export interface ChargersInput {
  lat: number
  lng: number
  radiusKm?: number
}

export interface ChargerStation {
  id: string
  name: string
  lat: number
  lng: number
  numStalls: number
  maxKw: number
  version: "V2" | "V3" | "V4"
  distanceKm: number
  sourceStatus: SourceStatus
}

// ---------------------------------------------------------------------------
// Seed lookup — always available offline
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function findSeedChargers(input: ChargersInput): ChargerStation[] {
  const radius = input.radiusKm ?? 50
  const results: ChargerStation[] = []

  for (const sc of superchargersData as Array<{
    id: string
    name: string
    lat: number
    lng: number
    numStalls: number
    maxKw: number
    version: string
    sourceStatus: string
  }>) {
    const distanceKm = haversineKm(input.lat, input.lng, sc.lat, sc.lng)
    if (distanceKm <= radius) {
      results.push({
        id: sc.id,
        name: sc.name,
        lat: sc.lat,
        lng: sc.lng,
        numStalls: sc.numStalls,
        maxKw: sc.maxKw,
        version: sc.version as "V2" | "V3" | "V4",
        distanceKm: Math.round(distanceKm * 10) / 10,
        sourceStatus: sc.sourceStatus as SourceStatus,
      })
    }
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm)
}

// ---------------------------------------------------------------------------
// Open Charge Map live fetch (requires OPENCHARGEMAP_API_KEY)
// ---------------------------------------------------------------------------

interface OCMPoi {
  ID: number
  AddressInfo: {
    Title: string
    Latitude: number
    Longitude: number
    DistanceUnit: number
    Distance: number
  }
  Connections?: Array<{
    PowerKW?: number
    Quantity?: number
  }>
}

async function fetchOpenChargeMap(input: ChargersInput): Promise<ChargerStation[] | null> {
  const apiKey = process.env.OPENCHARGEMAP_API_KEY
  if (!apiKey) return null

  const radius = input.radiusKm ?? 50
  const url =
    `https://api.openchargemap.io/v3/poi/?` +
    `output=json&countrycode=FR&latitude=${input.lat}&longitude=${input.lng}` +
    `&distance=${radius}&distanceunit=km&maxresults=20` +
    `&operatorid=3510&compact=true` + // Tesla network operator ID
    `&key=${apiKey}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null

    const data = (await res.json()) as OCMPoi[]
    if (!Array.isArray(data)) return null

    return data.map((poi) => {
      const maxKw = Math.max(
        0,
        ...(poi.Connections ?? []).map((c) => c.PowerKW ?? 0)
      )
      const numStalls = (poi.Connections ?? []).reduce(
        (sum, c) => sum + (c.Quantity ?? 1),
        0
      )
      const version: "V2" | "V3" | "V4" =
        maxKw >= 200 ? "V3" : "V2"

      return {
        id: `ocm-${poi.ID}`,
        name: poi.AddressInfo.Title,
        lat: poi.AddressInfo.Latitude,
        lng: poi.AddressInfo.Longitude,
        numStalls,
        maxKw,
        version,
        distanceKm: Math.round(poi.AddressInfo.Distance * 10) / 10,
        sourceStatus: "verified" as SourceStatus,
      }
    })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public chargers provider
// Resolution: 1. Open Charge Map live (if API key)  2. Seed data
// ---------------------------------------------------------------------------

export async function getNearbyChargers(input: ChargersInput): Promise<ChargerStation[]> {
  if (process.env.NEXT_PUBLIC_APP_MODE === "live") {
    const live = await fetchOpenChargeMap(input)
    if (live && live.length > 0) return live
  }

  return findSeedChargers(input)
}

export function getNearestCharger(input: ChargersInput): ChargerStation | null {
  const all = findSeedChargers(input)
  return all.length > 0 ? all[0] : null
}
