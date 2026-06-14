import { describe, it, expect } from "vitest";
import { knapsack, selectOptimal, layoutAligned, type KnapsackItem } from "./optimizer";
import { layout, haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import { REFERENCE_REQUEST } from "@/data/synthesis-fixtures";

const adapters: SynthesisAdapters = {
  travel: { async estimate(from, to) { const km = haversineKm(from, to); return { minutes: Math.round((km / 90) * 60), chargeStops: Math.floor(km / 250), sourceStatus: "estimated" }; } },
  canicule: { async isHeatAlert(_l, date) { return date >= "2026-08-06" && date <= "2026-08-09"; } },
};

// Recherche exhaustive de référence (petits ensembles) pour valider l'optimalité.
function bruteForce<T>(items: KnapsackItem<T>[], budget: number): number {
  let best = 0;
  for (let mask = 0; mask < (1 << items.length); mask++) {
    let v = 0, c = 0;
    for (let i = 0; i < items.length; i++) if (mask & (1 << i)) { v += items[i].value; c += items[i].cost; }
    if (c <= budget && v > best) best = v;
  }
  return best;
}

describe("knapsack — optimal (vs recherche exhaustive)", () => {
  it("retourne la valeur maximale exacte", () => {
    const items: KnapsackItem<string>[] = [
      { value: 60, cost: 100, ref: "a" },
      { value: 100, cost: 120, ref: "b" },
      { value: 120, cost: 150, ref: "c" },
      { value: 40, cost: 60, ref: "d" },
      { value: 90, cost: 110, ref: "e" },
    ];
    for (const budget of [0, 60, 150, 230, 300, 400, 1000]) {
      const chosen = knapsack(items, budget);
      const value = chosen.reduce((s, id) => s + items.find(i => i.ref === id)!.value, 0);
      const cost = chosen.reduce((s, id) => s + items.find(i => i.ref === id)!.cost, 0);
      expect(cost).toBeLessThanOrEqual(budget);
      expect(value).toBe(bruteForce(items, budget));
    }
  });

  it("est déterministe", () => {
    const items: KnapsackItem<number>[] = [1, 2, 3, 4].map(n => ({ value: n * 10, cost: n * 30, ref: n }));
    expect(knapsack(items, 90)).toEqual(knapsack(items, 90));
  });
});

describe("selectOptimal — personnes forcées (ancres souples)", () => {
  it("inclut toujours les personnes même si le budget est nul", () => {
    const people = REFERENCE_REQUEST.people!;
    const sel = selectOptimal({ pool: REFERENCE_REQUEST.opportunities, people, weightOf: () => 0, budgetMin: 0 });
    for (const p of people) expect(sel.map(o => o.id)).toContain(p.id);
  });
});

describe("layoutAligned — alignement exact de l'ancre (S7)", () => {
  it("pose l'ancre exactement sur sa date", async () => {
    const r = REFERENCE_REQUEST;
    const anchorDate = r.anchors[0].start.slice(0, 10);
    const cand = await layoutAligned(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "decouvreur", label: "T" },
      adapters,
    );
    const anchorDay = cand.days.find(d => d.stops.some(s => s.kind === "anchor"));
    expect(anchorDay).toBeDefined();
    expect(anchorDay!.date).toBe(anchorDate);
  });

  it("ne fait pas rouler le foyer les jours travaillés (≤ 90 min)", async () => {
    const r = REFERENCE_REQUEST;
    const cand = await layoutAligned(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    for (const d of cand.days) if (d.isWorkday) expect(d.driveMinutes).toBeLessThanOrEqual(90);
  });

  it("bloque 12h–16h uniquement les jours d'alerte chaleur", async () => {
    const r = REFERENCE_REQUEST;
    const cand = await layoutAligned(
      { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, ambiance: "decouvreur", label: "T" },
      adapters,
    );
    const blocked = cand.days.filter(d => d.stops.some(s => s.kind === "canicule-block")).map(d => d.date);
    for (const date of blocked) expect(date >= "2026-08-06" && date <= "2026-08-09").toBe(true);
  });

  it("place au moins autant d'étapes que le glouton V1 (optimalité de répartition)", async () => {
    const r = REFERENCE_REQUEST;
    const params = { anchor: r.anchors[0], selected: r.opportunities, window: r.window, constraints: r.constraints, label: "T" };
    const aligned = await layoutAligned({ ...params, ambiance: "decouvreur" }, adapters);
    const greedy = await layout({ ...params, ambiance: "decouvreur" }, adapters);
    expect(aligned.includedOpportunityIds.length).toBeGreaterThanOrEqual(greedy.includedOpportunityIds.length);
  });
});
