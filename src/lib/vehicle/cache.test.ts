import { describe, it, expect } from "vitest"
import { CachingVehicleProvider } from "./cache"
import type {
  CommandResult,
  Vehicle,
  VehicleCommand,
  VehicleProvider,
  VehicleState,
} from "./types"

/** Délégué espion : compte les lectures (= appels facturables Fleet API). */
class CountingProvider implements VehicleProvider {
  readonly mode = "tesla" as const
  listCalls = 0
  stateCalls = 0
  commandCalls = 0

  async listVehicles(): Promise<Vehicle[]> {
    this.listCalls++
    return [
      { id: "v1", vin: "VIN1", displayName: "V1", model: "Tesla Model S", usableKwh: 95, maxChargingKw: 250 },
    ]
  }

  async getVehicleState(vehicleId: string): Promise<VehicleState> {
    this.stateCalls++
    return {
      vehicleId,
      soc: 70,
      chargeLimitSoc: 80,
      estimatedRangeKm: 380,
      isCharging: false,
      connectivity: "online",
      readAt: new Date(this.stateCalls * 1000).toISOString(),
      source: "tesla",
    }
  }

  async sendCommand(_vehicleId: string, _command: VehicleCommand): Promise<CommandResult> {
    void _vehicleId
    void _command
    this.commandCalls++
    return { ok: true, message: "ok", requiresSignedCommand: false }
  }
}

function freshStore() {
  return new Map()
}

describe("CachingVehicleProvider", () => {
  it("ne facture qu'une lecture d'état dans la fenêtre TTL", async () => {
    const delegate = new CountingProvider()
    const t = 0
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => t,
      store: freshStore(),
    })

    const a = await cache.getVehicleState("v1")
    const b = await cache.getVehicleState("v1") // dans la fenêtre → cache
    expect(delegate.stateCalls).toBe(1)
    expect(b).toEqual(a) // même lecture (readAt identique)
  })

  it("relit après expiration du TTL", async () => {
    const delegate = new CountingProvider()
    let t = 0
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => t,
      store: freshStore(),
    })

    await cache.getVehicleState("v1")
    t = 300_001 // TTL dépassé
    await cache.getVehicleState("v1")
    expect(delegate.stateCalls).toBe(2)
  })

  it("met en cache par véhicule (clés distinctes)", async () => {
    const delegate = new CountingProvider()
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => 0,
      store: freshStore(),
    })
    await cache.getVehicleState("v1")
    await cache.getVehicleState("v2")
    expect(delegate.stateCalls).toBe(2)
  })

  it("met aussi en cache la liste des véhicules", async () => {
    const delegate = new CountingProvider()
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => 0,
      store: freshStore(),
    })
    await cache.listVehicles()
    await cache.listVehicles()
    expect(delegate.listCalls).toBe(1)
  })

  it("préserve le mode du délégué", () => {
    const cache = new CachingVehicleProvider(new CountingProvider(), { ttlMs: 1000, store: freshStore() })
    expect(cache.mode).toBe("tesla")
  })

  it("invalide le cache d'état après une commande réussie", async () => {
    const delegate = new CountingProvider()
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => 0,
      store: freshStore(),
    })

    await cache.getVehicleState("v1") // 1re lecture → cache
    await cache.getVehicleState("v1") // servie depuis le cache
    expect(delegate.stateCalls).toBe(1)

    await cache.sendCommand("v1", { type: "start_climate" }) // change l'état
    await cache.getVehicleState("v1") // doit relire (cache invalidé)
    expect(delegate.stateCalls).toBe(2)
  })

  it("ne met jamais une commande en cache", async () => {
    const delegate = new CountingProvider()
    const cache = new CachingVehicleProvider(delegate, {
      ttlMs: 300_000,
      now: () => 0,
      store: freshStore(),
    })
    await cache.sendCommand("v1", { type: "stop_climate" })
    await cache.sendCommand("v1", { type: "stop_climate" })
    expect(delegate.commandCalls).toBe(2)
  })
})
