/**
 * Backend ILP optionnel (S7+) via **glpk.js** (GLPK compilé en WASM, pur JS,
 * GPL→ici en dépendance build ; aucune dépendance native).
 *
 * Le sac à dos 0/1 du `optimizer.ts` est déjà **exact** (DP) sur ce modèle ;
 * ce backend prouve qu'un vrai solveur ILP donne le **même optimum**, et offre
 * une base pour des modèles plus riches (contraintes couplées sélection/jour).
 *
 * Activé uniquement si `SYNTHESIS_SOLVER=ilp`. glpk.js est chargé en **import
 * dynamique** (jamais dans le bundle client) ; toute erreur retombe sur le DP.
 */

import type { Opportunity } from "./types";
import { selectOptimal, type KnapsackItem, type SelectionInput } from "./optimizer";

interface GlpkVar { name: string; coef: number }
interface GlpkLike {
  GLP_MAX: number; GLP_UP: number; GLP_MSG_OFF: number;
  solve(lp: unknown, opts?: unknown): Promise<{ result: { vars: Record<string, number> } }> | { result: { vars: Record<string, number> } };
}

async function loadGlpk(): Promise<GlpkLike> {
  const mod = (await import("glpk.js")) as unknown as { default?: () => Promise<GlpkLike> } & (() => Promise<GlpkLike>);
  const factory = (mod.default ?? mod) as () => Promise<GlpkLike>;
  return factory();
}

/** Sac à dos 0/1 résolu en **ILP exact** (binaires). Mêmes types que le DP. */
export async function knapsackILP<T>(items: KnapsackItem<T>[], budget: number): Promise<T[]> {
  const glpk = await loadGlpk();
  const objVars: GlpkVar[] = items.map((it, i) => ({ name: `x${i}`, coef: Math.max(0, it.value) }));
  const capVars: GlpkVar[] = items.map((it, i) => ({ name: `x${i}`, coef: Math.max(0, Math.floor(it.cost)) }));
  const out = await glpk.solve(
    {
      name: "knapsack",
      objective: { direction: glpk.GLP_MAX, name: "value", vars: objVars },
      subjectTo: [{ name: "budget", vars: capVars, bnds: { type: glpk.GLP_UP, ub: Math.max(0, Math.floor(budget)), lb: 0 } }],
      binaries: items.map((_, i) => `x${i}`),
    },
    { msglev: glpk.GLP_MSG_OFF },
  );
  const sol = out.result.vars;
  return items.filter((_, i) => (sol[`x${i}`] ?? 0) > 0.5).map((it) => it.ref);
}

/** Sélection optimale via ILP : personnes forcées, puis ILP sur le reste. */
export async function selectOptimalILP(input: SelectionInput): Promise<Opportunity[]> {
  const forced = input.people;
  const forcedCost = forced.reduce((s, o) => s + o.durationMin, 0);
  const remainingBudget = Math.max(0, input.budgetMin - forcedCost);
  const items: KnapsackItem<Opportunity>[] = input.pool.map((o) => ({
    value: Math.max(0, Math.round(input.weightOf(o) * 100)),
    cost: o.durationMin,
    ref: o,
  }));
  const picked = await knapsackILP(items, remainingBudget);
  return [...forced, ...picked];
}

/**
 * Sélection avec choix du solveur : ILP si `SYNTHESIS_SOLVER=ilp` (repli DP en
 * cas d'erreur de chargement WASM), sinon le DP exact (rapide, déterministe).
 */
export async function selectWithSolver(input: SelectionInput): Promise<Opportunity[]> {
  if (process.env.SYNTHESIS_SOLVER === "ilp") {
    try {
      return await selectOptimalILP(input);
    } catch {
      return selectOptimal(input);
    }
  }
  return selectOptimal(input);
}
