import { describe, it, expect } from "vitest"
import { fuseDayTimeline, timelineFromLegs, formatHour } from "./fusion"
import type { TimelineLeg } from "./types"

const oneLeg = (driveMinutes: number, toName = "Marseille"): TimelineLeg[] => [
  { driveMinutes, toName },
]

describe("fuseDayTimeline — pauses bébé", () => {
  it("insère une pause dès maxLegMinutes de conduite", () => {
    const r = fuseDayTimeline({
      departureHour: 9,
      legs: oneLeg(300),
      maxLegMinutes: 120,
    })
    expect(r.babyPauseCount).toBe(2)
    const pauses = r.events.filter((e) => e.type === "baby-pause")
    expect(pauses).toHaveLength(2)
    // Aucun bloc de conduite ne dépasse 120 min.
    for (const e of r.events.filter((e) => e.type === "drive")) {
      expect((e.endHour - e.startHour) * 60).toBeLessThanOrEqual(120 + 1e-6)
    }
  })

  it("une recharge réinitialise le compteur bébé (alignement)", () => {
    const r = fuseDayTimeline({
      departureHour: 9,
      legs: [
        { driveMinutes: 120, toName: "Sens", chargeMinutes: 30, chargerName: "Sens" },
        { driveMinutes: 60, toName: "Marseille" },
      ],
      maxLegMinutes: 120,
    })
    // La recharge sert de pause → pas de pause bébé séparée juste après.
    expect(r.babyPauseCount).toBe(0)
    expect(r.events.some((e) => e.type === "charge")).toBe(true)
  })
})

describe("fuseDayTimeline — canicule (critère M5)", () => {
  const r = fuseDayTimeline({
    departureHour: 9,
    legs: oneLeg(300),
    maxLegMinutes: 120,
    heatWindow: [12, 16],
  })

  it("bloque la conduite sur la fenêtre 12h–16h", () => {
    const block = r.events.find((e) => e.type === "heat-block")
    expect(block).toBeDefined()
    expect(block?.startHour).toBeCloseTo(12, 5)
    expect(block?.endHour).toBeCloseTo(16, 5)
  })

  it("ne planifie aucune conduite entre 12h et 16h", () => {
    for (const e of r.events.filter((e) => e.type === "drive")) {
      const overlaps = e.startHour < 16 - 1e-6 && e.endHour > 12 + 1e-6
      expect(overlaps).toBe(false)
    }
  })

  it("reprend la conduite après 16h et reste faisable dans la journée", () => {
    expect(r.feasibleWithinDay).toBe(true)
    const afterBlock = r.events.filter((e) => e.type === "drive" && e.startHour >= 16 - 1e-6)
    expect(afterBlock.length).toBeGreaterThan(0)
  })

  it("est déterministe", () => {
    const again = fuseDayTimeline({
      departureHour: 9,
      legs: oneLeg(300),
      maxLegMinutes: 120,
      heatWindow: [12, 16],
    })
    expect(again).toEqual(r)
  })
})

describe("fuseDayTimeline — télétravail", () => {
  it("diffère la conduite après les heures ouvrées", () => {
    const r = fuseDayTimeline({
      departureHour: 9,
      legs: oneLeg(90),
      maxLegMinutes: 120,
      workWindow: [8.5, 19],
    })
    const block = r.events.find((e) => e.type === "work-block")
    expect(block).toBeDefined()
    expect(block?.endHour).toBeCloseTo(19, 5)
    // Toute la conduite a lieu après 19h.
    for (const e of r.events.filter((e) => e.type === "drive")) {
      expect(e.startHour).toBeGreaterThanOrEqual(19 - 1e-6)
    }
  })
})

describe("fuseDayTimeline — débordement de journée", () => {
  it("signale une nuitée nécessaire au-delà de dayEndHour", () => {
    const r = fuseDayTimeline({
      departureHour: 20,
      legs: oneLeg(300),
      maxLegMinutes: 120,
      dayEndHour: 22,
    })
    expect(r.feasibleWithinDay).toBe(false)
    expect(r.conflicts.some((c) => /nuitée/i.test(c))).toBe(true)
  })
})

describe("timelineFromLegs", () => {
  it("active les fenêtres selon canicule / jour travaillé", () => {
    const legs = oneLeg(300)
    const heat = timelineFromLegs(legs, {
      departureHour: 9,
      maxLegMinutes: 120,
      isHeatwave: true,
      heatWindow: [12, 16],
      isWorkDay: false,
      workWindow: [8.5, 19],
    })
    expect(heat.events.some((e) => e.type === "heat-block")).toBe(true)
    expect(heat.events.some((e) => e.type === "work-block")).toBe(false)
  })
})

describe("formatHour", () => {
  it("formate heures pleines et demies", () => {
    expect(formatHour(16)).toBe("16h")
    expect(formatHour(8.5)).toBe("8h30")
  })
})
