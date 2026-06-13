import { describe, it, expect, afterEach } from "vitest"
import { MockVehicleProvider } from "./mock-provider"
import { TeslaVehicleProvider } from "./tesla-provider"
import { getVehicleProvider } from "./provider"
import { VehicleNotFoundError, VehicleSchema, VehicleStateSchema } from "./types"

describe("MockVehicleProvider", () => {
  const provider = new MockVehicleProvider()

  it("expose le mode mock", () => {
    expect(provider.mode).toBe("mock")
  })

  it("liste au moins un véhicule conforme au schéma", async () => {
    const vehicles = await provider.listVehicles()
    expect(vehicles.length).toBeGreaterThan(0)
    for (const v of vehicles) expect(() => VehicleSchema.parse(v)).not.toThrow()
    expect(vehicles[0].model).toContain("Model S")
  })

  it("lit un état déterministe et valide", async () => {
    const [v] = await provider.listVehicles()
    const now = new Date("2026-06-13T10:00:00.000Z")
    const a = await provider.getVehicleState(v.id, now)
    const b = await provider.getVehicleState(v.id, now)
    expect(() => VehicleStateSchema.parse(a)).not.toThrow()
    expect(a).toEqual(b) // déterminisme
    expect(a.soc).toBeGreaterThan(0)
    expect(a.soc).toBeLessThanOrEqual(100)
    expect(a.source).toBe("mock")
    expect(a.readAt).toBe(now.toISOString())
  })

  it("dérive une autonomie cohérente avec le SoC", async () => {
    const state = await provider.getVehicleState("tesla-model-s-raven")
    // 82 % d'une autonomie pleine ~540 km → ~443 km
    expect(state.estimatedRangeKm).toBeGreaterThan(400)
    expect(state.estimatedRangeKm).toBeLessThan(500)
  })

  it("lève VehicleNotFoundError pour un id inconnu", async () => {
    await expect(provider.getVehicleState("inconnu")).rejects.toBeInstanceOf(
      VehicleNotFoundError,
    )
  })
})

describe("getVehicleProvider", () => {
  const original = { ...process.env }
  afterEach(() => {
    process.env = { ...original }
  })

  it("retombe sur le mock sans configuration Tesla", () => {
    delete process.env.TESLA_FLEET_API_BASE
    delete process.env.TESLA_ACCESS_TOKEN
    expect(getVehicleProvider().mode).toBe("mock")
  })

  it("reste en mock si les clés existent mais le mode n'est pas live", () => {
    process.env.NEXT_PUBLIC_APP_MODE = "mock"
    process.env.TESLA_FLEET_API_BASE = "https://fleet.example"
    process.env.TESLA_ACCESS_TOKEN = "tok"
    expect(getVehicleProvider().mode).toBe("mock")
  })

  it("passe en Tesla quand mode live + clés présentes", () => {
    process.env.NEXT_PUBLIC_APP_MODE = "live"
    process.env.TESLA_FLEET_API_BASE = "https://fleet.example"
    process.env.TESLA_ACCESS_TOKEN = "tok"
    expect(getVehicleProvider().mode).toBe("tesla")
  })
})

describe("TeslaVehicleProvider (fetch simulé)", () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }

  it("mappe la liste des véhicules Fleet API", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        response: [
          { id_s: "999", vin: "5YJSA1E2XKF000000", display_name: "MA TESLA", state: "online" },
        ],
      })) as unknown as typeof fetch

    const provider = new TeslaVehicleProvider({
      apiBase: "https://fleet.example",
      accessToken: "tok",
      fetchImpl,
    })
    const vehicles = await provider.listVehicles()
    expect(vehicles[0]).toMatchObject({ id: "999", displayName: "MA TESLA", model: "Tesla Model S" })
  })

  it("vérifie la connectivité puis lit charge_state (online)", async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      if (url.endsWith("/api/1/vehicles/999")) {
        return jsonResponse({ response: { state: "online" } })
      }
      return jsonResponse({
        response: {
          charge_state: {
            battery_level: 64,
            charge_limit_soc: 80,
            est_battery_range: 200, // miles
            charging_state: "Disconnected",
          },
        },
      })
    }) as unknown as typeof fetch

    const provider = new TeslaVehicleProvider({
      apiBase: "https://fleet.example",
      accessToken: "tok",
      fetchImpl,
    })
    const state = await provider.getVehicleState("999")
    expect(state.soc).toBe(64)
    expect(state.estimatedRangeKm).toBe(Math.round(200 * 1.60934))
    expect(state.isCharging).toBe(false)
    expect(state.source).toBe("tesla")
    // Connectivité vérifiée avant la donnée (ordre des appels).
    expect(calls[0]).toContain("/api/1/vehicles/999")
    expect(calls[1]).toContain("charge_state")
  })

  it("ne lit pas la donnée si le véhicule est en veille", async () => {
    let dataCalled = false
    const fetchImpl = (async (url: string) => {
      if (url.includes("charge_state")) {
        dataCalled = true
        return jsonResponse({})
      }
      return jsonResponse({ response: { state: "asleep" } })
    }) as unknown as typeof fetch

    const provider = new TeslaVehicleProvider({
      apiBase: "https://fleet.example",
      accessToken: "tok",
      fetchImpl,
    })
    const state = await provider.getVehicleState("999")
    expect(state.connectivity).toBe("asleep")
    expect(dataCalled).toBe(false) // jamais de réveil forcé
  })
})
