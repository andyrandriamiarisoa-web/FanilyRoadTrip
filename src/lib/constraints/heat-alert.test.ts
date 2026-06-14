import { describe, it, expect } from "vitest"
import { deriveHeatAlert, type WeatherReading } from "./heat-alert"

const reading = (
  name: string,
  tempMaxC: number,
  heatwave: boolean,
): WeatherReading => ({ name, tempMaxC, heatwave, sourceStatus: "seed" })

describe("deriveHeatAlert", () => {
  it("aucune alerte sans relevé (pas de blocage)", () => {
    const a = deriveHeatAlert([])
    expect(a.active).toBe(false)
    expect(a.maxTempC).toBeNull()
    expect(a.reason).toMatch(/pas de blocage/i)
  })

  it("aucune alerte si aucun point n'est en canicule → conduite libre", () => {
    const a = deriveHeatAlert([
      reading("Fresnes", 30, false),
      reading("Marseille", 33, false),
    ])
    expect(a.active).toBe(false)
    expect(a.maxTempC).toBe(33)
    expect(a.hottestLocation).toBe("Marseille")
    expect(a.reason).toMatch(/conduite libre/i)
  })

  it("alerte active si au moins un point est en canicule (vigilance segment)", () => {
    const a = deriveHeatAlert([
      reading("Fresnes", 30, false),
      reading("Montélimar", 38, true),
      reading("Marseille", 33, false),
    ])
    expect(a.active).toBe(true)
    expect(a.maxTempC).toBe(38)
    expect(a.hottestLocation).toBe("Montélimar")
    expect(a.reason).toMatch(/bloquée 12h–16h/i)
  })

  it("propage la source du point le plus chaud", () => {
    const a = deriveHeatAlert([
      { name: "Fresnes", tempMaxC: 30, heatwave: false, sourceStatus: "seed" },
      { name: "Valence", tempMaxC: 39, heatwave: true, sourceStatus: "verified" },
    ])
    expect(a.sourceStatus).toBe("verified")
  })

  it("est déterministe", () => {
    const input = [reading("A", 31, false), reading("B", 37, true)]
    expect(deriveHeatAlert(input)).toEqual(deriveHeatAlert(input))
  })
})
