/**
 * Tests unitaires — realistic-time.ts (M7)
 *
 * Aucun réseau. Déterministe.
 */

import { describe, it, expect } from "vitest"
import { estimateRealisticLeg, formatHm } from "./realistic-time"

// ---------------------------------------------------------------------------
// formatHm
// ---------------------------------------------------------------------------

describe("formatHm", () => {
  it("formate les minutes seules (< 60)", () => {
    expect(formatHm(45)).toBe("45 min")
    expect(formatHm(0)).toBe("0 min")
    expect(formatHm(59)).toBe("59 min")
  })

  it("formate les heures rondes", () => {
    expect(formatHm(60)).toBe("1 h")
    expect(formatHm(120)).toBe("2 h")
    expect(formatHm(360)).toBe("6 h")
  })

  it("formate heures + minutes", () => {
    expect(formatHm(370)).toBe("6 h 10")
    expect(formatHm(65)).toBe("1 h 05")
    expect(formatHm(150)).toBe("2 h 30")
  })
})

// ---------------------------------------------------------------------------
// estimateRealisticLeg
// ---------------------------------------------------------------------------

describe("estimateRealisticLeg", () => {
  // Trajet de référence : Montélimar → Paris ≈ 580 km, ~340 min fluide haversine
  // On simule ce que getRoute retournerait via haversine (~580 km, ~348 min)
  const MONTELIMAR_PARIS = {
    distanceKm: 580,
    freeFlowMinutes: 348,
    babyOnboard: true,
    isEv: true,
  }

  it("Montélimar → Paris (samedi août) > 360 min (6 h)", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-08-08", // samedi en août
    })
    // Doit dépasser 6 h (ne peut plus être 3h40 comme avant)
    expect(leg.totalMinutes).toBeGreaterThan(360)
  })

  it("Montélimar → Paris — ventilation cohérente", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-08-08", // samedi en août
    })
    // drivingMinutes = round(348 * 1.08) = 376
    expect(leg.drivingMinutes).toBe(Math.round(348 * 1.08))
    // Pas bébé = ceil(376/120) * 15
    expect(leg.pauseMinutes).toBe(Math.ceil(leg.drivingMinutes / 120) * 15)
    // Recharge EV = floor(580/250) * 25 = 2 * 25 = 50
    expect(leg.chargingMinutes).toBe(Math.floor(580 / 250) * 25)
    // Total = somme des parties
    expect(leg.totalMinutes).toBe(
      leg.drivingMinutes + leg.trafficMarginMinutes + leg.pauseMinutes + leg.chargingMinutes,
    )
  })

  it("trafic : samedi d'août donne marge > mardi d'hiver", () => {
    const saturAout = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-08-08", // samedi août
    })
    const mardiHiver = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-01-13", // mardi janvier
    })
    expect(saturAout.trafficMarginMinutes).toBeGreaterThan(mardiHiver.trafficMarginMinutes)
  })

  it("plafond +40 % sur la marge trafic", () => {
    // Samedi août = base 5% + 15% été + 15% samedi = 35% → sous le plafond
    // On vérifie que la marge n'excède jamais 40% de drivingMinutes
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-08-08",
    })
    expect(leg.trafficMarginMinutes).toBeLessThanOrEqual(
      Math.round(leg.drivingMinutes * 0.40) + 1, // +1 pour les arrondis
    )
  })

  it("pas de pause bébé si babyOnboard=false", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-15",
      babyOnboard: false,
    })
    expect(leg.pauseMinutes).toBe(0)
  })

  it("pas de recharge si isEv=false", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-15",
      isEv: false,
    })
    expect(leg.chargingMinutes).toBe(0)
  })

  it("trajet court (< 250 km) : pas de recharge", () => {
    const leg = estimateRealisticLeg({
      distanceKm: 75,
      freeFlowMinutes: 50,
      date: "2026-06-15",
      babyOnboard: false,
      isEv: true,
    })
    expect(leg.chargingMinutes).toBe(0)
  })

  it("trajet 500 km : 2 recharges (50 min)", () => {
    const leg = estimateRealisticLeg({
      distanceKm: 500,
      freeFlowMinutes: 300,
      date: "2026-06-15",
      babyOnboard: false,
      isEv: true,
    })
    // floor(500/250)*25 = 2*25 = 50
    expect(leg.chargingMinutes).toBe(50)
  })

  it("trajet 300 km : 1 recharge (25 min)", () => {
    const leg = estimateRealisticLeg({
      distanceKm: 300,
      freeFlowMinutes: 180,
      date: "2026-06-15",
      babyOnboard: false,
      isEv: true,
    })
    // floor(300/250)*25 = 1*25 = 25
    expect(leg.chargingMinutes).toBe(25)
  })

  it("mardi d'hiver : note de trafic fluide", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-01-13", // mardi janvier
    })
    // Base 5% uniquement → trafic fluide
    expect(leg.trafficNote).toMatch(/fluide/i)
  })

  it("samedi d'août : note mentionne le trafic chargé", () => {
    const leg = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-08-08", // samedi août
    })
    expect(leg.trafficNote).toMatch(/chargé|estival|samedi/i)
  })

  it("vendredi : marge trafic > mardi même mois", () => {
    const vendredi = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-12", // vendredi juin
    })
    const mardi = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-09", // mardi juin
    })
    expect(vendredi.trafficMarginMinutes).toBeGreaterThan(mardi.trafficMarginMinutes)
  })

  it("dimanche : marge trafic > mercredi même mois", () => {
    const dimanche = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-14", // dimanche juin
    })
    const mercredi = estimateRealisticLeg({
      ...MONTELIMAR_PARIS,
      date: "2026-06-10", // mercredi juin
    })
    expect(dimanche.trafficMarginMinutes).toBeGreaterThan(mercredi.trafficMarginMinutes)
  })

  it("est déterministe (même entrée → même sortie)", () => {
    const a = estimateRealisticLeg({ ...MONTELIMAR_PARIS, date: "2026-08-08" })
    const b = estimateRealisticLeg({ ...MONTELIMAR_PARIS, date: "2026-08-08" })
    expect(a).toEqual(b)
  })
})
