import { describe, it, expect } from "vitest";
import { knapsackILP } from "./ilp";
import { knapsack, type KnapsackItem } from "./optimizer";

const items: KnapsackItem<string>[] = [
  { value: 60, cost: 100, ref: "a" },
  { value: 100, cost: 120, ref: "b" },
  { value: 120, cost: 150, ref: "c" },
  { value: 40, cost: 60, ref: "d" },
  { value: 90, cost: 110, ref: "e" },
];

function valueOf(ids: string[]): number {
  return ids.reduce((s, id) => s + items.find((i) => i.ref === id)!.value, 0);
}

describe("knapsackILP (glpk.js) — même optimum que le DP exact", () => {
  it("retourne la même valeur optimale que le DP", async () => {
    for (const budget of [60, 150, 230, 300, 400]) {
      const ilp = await knapsackILP(items, budget);
      const dp = knapsack(items, budget);
      const cost = ilp.reduce((s, id) => s + items.find((i) => i.ref === id)!.cost, 0);
      expect(cost).toBeLessThanOrEqual(budget);
      expect(valueOf(ilp)).toBe(valueOf(dp));
    }
  });
});
