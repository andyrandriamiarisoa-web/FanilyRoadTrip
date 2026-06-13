import { describe, it, expect, vi, beforeEach } from "vitest"
import { getWeather } from "./weather"

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("getWeather — seed mode", () => {
  it("returns seed data for Marseille in mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const result = await getWeather({ lat: 43.30, lng: 5.37, date: "2026-08-08" })
    expect(result.sourceStatus).toBe("seed")
    expect(result.tempMaxC).toBeGreaterThan(0)
    expect(result.date).toBe("2026-08-08")
  })

  it("returns seed data for Tain-l'Hermitage with heatwave flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const result = await getWeather({ lat: 44.93, lng: 4.89, date: "2026-08-01" })
    expect(result.sourceStatus).toBe("seed")
    expect(result.heatwave).toBe(true)
    expect(result.tempMaxC).toBeGreaterThanOrEqual(36)
  })

  it("returns nearest seed point for coordinate near Dijon", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const result = await getWeather({ lat: 47.35, lng: 5.10, date: "2026-08-01" })
    expect(result.sourceStatus).toBe("seed")
    expect(result.tempMaxC).toBeGreaterThan(0)
  })

  it("returns estimated for unknown location far from seeds", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    const result = await getWeather({ lat: 48.85, lng: 2.35, date: "2026-08-01" })
    // Paris is close to Fresnes seed
    expect(["seed", "estimated"]).toContain(result.sourceStatus)
  })
})

describe("getWeather — heatwave detection", () => {
  it("flags heatwave when tempMax ≥ 36", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    // Montélimar seed has 38°C
    const result = await getWeather({ lat: 44.56, lng: 4.75, date: "2026-08-02" })
    expect(result.heatwave).toBe(true)
  })

  it("does not flag heatwave when tempMax < 36", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "mock")
    // Dijon seed has 32°C
    const result = await getWeather({ lat: 47.32, lng: 5.04, date: "2026-08-02" })
    expect(result.heatwave).toBe(false)
  })
})
