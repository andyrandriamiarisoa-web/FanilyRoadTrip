import { describe, it, expect } from "vitest"
import {
  describeOfflineReadiness,
  OFFLINE_FEATURES,
  ONLINE_ONLY_FEATURES,
} from "./offline"

describe("describeOfflineReadiness", () => {
  it("indique l'état en ligne", () => {
    const r = describeOfflineReadiness(true)
    expect(r.online).toBe(true)
    expect(r.statusLabel).toMatch(/en ligne/i)
  })

  it("indique l'état hors-ligne avec données disponibles", () => {
    const r = describeOfflineReadiness(false)
    expect(r.online).toBe(false)
    expect(r.statusLabel).toMatch(/hors ligne/i)
    expect(r.usableOffline).toBe(true)
  })

  it("toutes les fonctions cœur sont disponibles hors-ligne", () => {
    expect(OFFLINE_FEATURES.every((f) => f.available)).toBe(true)
    expect(OFFLINE_FEATURES.map((f) => f.key)).toContain("carnet")
    expect(OFFLINE_FEATURES.map((f) => f.key)).toContain("vote")
  })

  it("la génération IA est honnêtement marquée online-only", () => {
    expect(ONLINE_ONLY_FEATURES.every((f) => !f.available)).toBe(true)
    expect(ONLINE_ONLY_FEATURES.map((f) => f.key)).toContain("ia")
  })
})
