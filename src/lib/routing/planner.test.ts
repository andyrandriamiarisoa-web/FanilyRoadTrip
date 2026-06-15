import { describe, it, expect } from "vitest"
import { SeedRoutePlanner, seedRoutePlanner } from "./planner"
import {
  RoutePlanResultSchema,
  DEFAULT_VEHICLE_PARAMS,
  vehicleParamsFromProfile,
  type ChargerCandidate,
  type RoutePlanRequest,
} from "./types"
import { DEFAULT_FAMILY_PROFILE } from "@/data/default-profile"

const FRESNES = { name: "Fresnes", lat: 48.754, lng: 2.321 }
const MARSEILLE = { name: "Marseille", lat: 43.296, lng: 5.37 }

function baseReq(overrides: Partial<RoutePlanRequest> = {}): RoutePlanRequest {
  return {
    origin: FRESNES,
    destination: MARSEILLE,
    startSocPct: 90,
    startSocSource: "target",
    targetArrivalSocPct: 20,
    ...overrides,
  }
}

describe("SeedRoutePlanner — trajet de référence Fresnes → Marseille", () => {
  const plan = seedRoutePlanner.plan(baseReq())

  it("produit un résultat valide selon le schéma Zod", () => {
    expect(() => RoutePlanResultSchema.parse(plan)).not.toThrow()
  })

  it("est faisable et n'utilise que des Superchargeurs", () => {
    expect(plan.feasible).toBe(true)
    expect(plan.superchargersOnly).toBe(true)
    expect(plan.chargeStops.length).toBeGreaterThan(0)
  })

  it("respecte le SoC d'arrivée cible", () => {
    expect(plan.arrivalSocPct).toBeGreaterThanOrEqual(plan.targetArrivalSocPct)
    expect(plan.arrivalMeetsTarget).toBe(true)
  })

  it("ne descend jamais sous le buffer de sécurité à l'arrivée d'un segment", () => {
    for (const seg of plan.segments) {
      expect(seg.endSocPct).toBeGreaterThanOrEqual(12 - 0.05)
    }
  })

  it("ne charge jamais au-dessus de la fenêtre batterie (80 %)", () => {
    for (const stop of plan.chargeStops) {
      expect(stop.socOnDeparturePct).toBeLessThanOrEqual(80 + 0.05)
      expect(stop.socOnDeparturePct).toBeGreaterThan(stop.socOnArrivalPct)
    }
  })

  it("chaque arrêt rappelle le préconditionnement et porte une source", () => {
    for (const stop of plan.chargeStops) {
      expect(stop.precondition).toBe(true)
      expect(stop.chargeMinutes).toBeGreaterThan(0)
      expect(["seed", "estimated", "verified"]).toContain(stop.sourceStatus)
    }
  })

  it("chaîne les segments de l'origine à la destination", () => {
    expect(plan.segments[0].fromName).toBe("Fresnes")
    expect(plan.segments.at(-1)?.toName).toBe("Marseille")
    // Continuité : la fin d'un segment = le début du suivant.
    for (let i = 1; i < plan.segments.length; i++) {
      expect(plan.segments[i].fromName).toBe(plan.segments[i - 1].toName)
    }
  })

  it("est déterministe", () => {
    const again = new SeedRoutePlanner().plan(baseReq())
    expect(again).toEqual(plan)
  })
})

describe("SeedRoutePlanner — SoC de départ", () => {
  it("un SoC de départ plus bas impose davantage de charge", () => {
    const high = seedRoutePlanner.plan(baseReq({ startSocPct: 90 }))
    const low = seedRoutePlanner.plan(baseReq({ startSocPct: 30 }))
    const sum = (mins: { chargeMinutes: number }[]) =>
      mins.reduce((s, x) => s + x.chargeMinutes, 0)
    expect(sum(low.chargeStops)).toBeGreaterThanOrEqual(sum(high.chargeStops))
  })

  it("distingue la source du SoC (live vs cible)", () => {
    const live = seedRoutePlanner.plan(baseReq({ startSocSource: "live" }))
    expect(live.startSocSource).toBe("live")
  })

  it("la conduite en canicule augmente la consommation totale", () => {
    const normal = seedRoutePlanner.plan(baseReq())
    const heat = seedRoutePlanner.plan(baseReq({ isHeatwave: true }))
    const consumption = (segs: { consumptionKwh: number }[]) =>
      segs.reduce((s, x) => s + x.consumptionKwh, 0)
    expect(consumption(heat.segments)).toBeGreaterThan(consumption(normal.segments))
  })
})

describe("Injection des paramètres véhicule du Profil Foyer", () => {
  it("convertit Wh/100km → Wh/km et SoC fractions → %", () => {
    const p = vehicleParamsFromProfile(DEFAULT_FAMILY_PROFILE.vehicle)
    expect(p.baseConsumptionWhKm).toBeCloseTo(185, 6)
    expect(p.bufferSocPct).toBeCloseTo(12, 6)
    expect(p.maxChargeSocPct).toBeCloseTo(80, 6)
    expect(p.usableKwh).toBe(DEFAULT_FAMILY_PROFILE.vehicle.usableKwh)
    // Le profil par défaut reflète les défauts du planificateur (injection cohérente).
    expect(p.highwayFactor).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.highwayFactor, 6)
    expect(p.heatFactor).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.heatFactor, 6)
  })

  it("la consommation du profil pilote le routage (arrivée plus basse si plus gourmand)", () => {
    // Trajet court sans recharge pour les deux véhicules → comparaison directe
    // du SoC d'arrivée (relation monotone avec la consommation).
    const shortReq = (vehicle?: RoutePlanRequest["vehicle"]): RoutePlanRequest => ({
      origin: { name: "Dijon", lat: 47.322, lng: 5.04 },
      destination: { name: "Mâcon", lat: 46.29, lng: 4.83 },
      startSocPct: 80,
      startSocSource: "live",
      targetArrivalSocPct: 20,
      vehicle,
    })
    const base = seedRoutePlanner.plan(shortReq())
    const thirsty = seedRoutePlanner.plan(shortReq({ ...DEFAULT_VEHICLE_PARAMS, baseConsumptionWhKm: 280 }))
    expect(base.chargeStops).toHaveLength(0)
    expect(thirsty.chargeStops).toHaveLength(0)
    expect(thirsty.segments[0].endSocPct).toBeLessThan(base.segments[0].endSocPct)
  })
})

describe("SeedRoutePlanner — cas dégradés", () => {
  it("trajet court sans charge si le SoC suffit", () => {
    const plan = seedRoutePlanner.plan({
      origin: { name: "Dijon", lat: 47.322, lng: 5.04 },
      destination: { name: "Mâcon", lat: 46.29, lng: 4.83 },
      startSocPct: 80,
      startSocSource: "live",
      targetArrivalSocPct: 20,
    })
    expect(plan.feasible).toBe(true)
    expect(plan.chargeStops.length).toBe(0)
    expect(plan.segments).toHaveLength(1)
  })

  it("signale honnêtement un trajet infaisable (aucun chargeur, gap trop grand)", () => {
    const plan = seedRoutePlanner.plan({
      origin: FRESNES,
      destination: MARSEILLE,
      startSocPct: 20,
      startSocSource: "target",
      targetArrivalSocPct: 20,
      chargers: [] as ChargerCandidate[], // aucun Supercharger disponible
    })
    expect(plan.feasible).toBe(false)
    expect(plan.conflicts.length).toBeGreaterThan(0)
  })
})
