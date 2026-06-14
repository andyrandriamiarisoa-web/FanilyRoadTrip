import { describe, it, expect } from "vitest";
import { layout, haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import { REFERENCE_REQUEST } from "@/data/synthesis-fixtures";

const adapters: SynthesisAdapters = {
  travel: {
    async estimate(from, to) {
      const km = haversineKm(from, to);
      return { minutes: Math.round((km / 90) * 60) + Math.floor(km / 250) * 25, chargeStops: Math.floor(km / 250), sourceStatus: "estimated" };
    },
  },
  canicule: { async isHeatAlert(_l, date) { return date >= "2026-08-06" && date <= "2026-08-09"; } },
};

describe("solver.layout (V1)", () => {
  it("produit un voyage daté dans la fenêtre, ancre placée", async () => {
    const r = REFERENCE_REQUEST;
    const cand = await layout(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "decouvreur", label: "Test" },
      adapters,
    );
    expect(cand.startDate >= r.window.earliestStart).toBe(true);
    expect(cand.endDate <= r.window.latestEnd).toBe(true);
    expect(cand.days.some(d => d.stops.some(s => s.kind === "anchor"))).toBe(true);
  });

  it("limite la conduite les jours travaillés", async () => {
    const r = REFERENCE_REQUEST;
    const cand = await layout(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "reposant", label: "Test" },
      adapters,
    );
    for (const d of cand.days) if (d.isWorkday) expect(d.driveMinutes).toBeLessThanOrEqual(90);
  });

  it("bloque 12h–16h uniquement les jours d'alerte chaleur", async () => {
    const r = REFERENCE_REQUEST;
    const cand = await layout(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "decouvreur", label: "Test" },
      adapters,
    );
    const blocked = cand.days.filter(d => d.stops.some(s => s.kind === "canicule-block")).map(d => d.date);
    for (const date of blocked) expect(date >= "2026-08-06" && date <= "2026-08-09").toBe(true);
  });
});
