import { describe, it, expect, vi, beforeEach } from "vitest"
import { getNearbyChargers, getNearestCharger } from "./chargers"

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe("getNearbyChargers — seed mode", () => {
  it("finds chargers near Villebon-sur-Yvette (Fresnes area)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const results = await getNearbyChargers({ lat: 48.75, lng: 2.32, radiusKm: 30 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].sourceStatus).toBe("seed")
  })

  it("returns chargers sorted by distance ascending", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const results = await getNearbyChargers({ lat: 47.32, lng: 5.04, radiusKm: 80 })
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distanceKm).toBeGreaterThanOrEqual(results[i - 1].distanceKm)
    }
  })

  it("returns empty array when no chargers within radius", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    // Remote location with tiny radius
    const results = await getNearbyChargers({ lat: 43.0, lng: 6.5, radiusKm: 1 })
    expect(results).toHaveLength(0)
  })

  it("uses default 50km radius when not specified", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const withDefault = await getNearbyChargers({ lat: 47.32, lng: 5.04 })
    const with50 = await getNearbyChargers({ lat: 47.32, lng: 5.04, radiusKm: 50 })
    expect(withDefault.map((c) => c.id)).toEqual(with50.map((c) => c.id))
  })
})

describe("getNearestCharger", () => {
  it("returns the nearest charger to Marseille", () => {
    const nearest = getNearestCharger({ lat: 43.30, lng: 5.37 })
    expect(nearest).not.toBeNull()
    expect(nearest!.distanceKm).toBeLessThan(50)
    expect(nearest!.sourceStatus).toBe("seed")
  })

  it("returns null when no chargers in range", () => {
    const nearest = getNearestCharger({ lat: 43.0, lng: 6.5, radiusKm: 1 })
    expect(nearest).toBeNull()
  })

  it("each charger has valid version field", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const results = await getNearbyChargers({ lat: 43.30, lng: 5.37, radiusKm: 200 })
    for (const sc of results) {
      expect(["V2", "V3", "V4"]).toContain(sc.version)
    }
  })
})
