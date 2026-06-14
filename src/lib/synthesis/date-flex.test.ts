import { describe, it, expect } from "vitest";
import { exploreDateFlex } from "./date-flex";
import { haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import { REFERENCE_REQUEST } from "@/data/synthesis-fixtures";

const adapters: SynthesisAdapters = {
  travel: { async estimate(from, to) { const km = haversineKm(from, to); return { minutes: Math.round((km/90)*60), chargeStops: 0, sourceStatus: "estimated" }; } },
  canicule: { async isHeatAlert(_l, date) { return date >= "2026-08-06" && date <= "2026-08-09"; } },
};

describe("exploreDateFlex", () => {
  it("renvoie des options de départ avec déblocages/canicule", async () => {
    const opts = await exploreDateFlex(REFERENCE_REQUEST, adapters, { maxOptions: 5 });
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(typeof o.startDate).toBe("string");
      expect(Array.isArray(o.unlocked)).toBe(true);
      expect(o.caniculeDays).toBeGreaterThanOrEqual(0);
    }
  });
});
