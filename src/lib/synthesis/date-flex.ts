import type { SynthesisRequest } from "./types";
import type { SynthesisAdapters } from "./adapters";
import { generateCandidates } from "./candidates";

export interface DateOption {
  startDate: string;
  bestAmbiance: string;
  score: number;
  includedCount: number;
  caniculeDays: number;
  unlocked: string[]; // titres débloqués vs base
  lost: string[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

// Re-joue la synthèse sur un balayage de dates de départ et expose ce que bouger les dates débloque.
export async function exploreDateFlex(
  req: SynthesisRequest, adapters: SynthesisAdapters, opts?: { stepDays?: number; maxOptions?: number },
): Promise<DateOption[]> {
  const step = opts?.stepDays ?? 1;
  const maxOptions = opts?.maxOptions ?? 7;
  const titleOf = (id: string) =>
    [...(req.opportunities ?? []), ...(req.people ?? [])].find(o => o.id === id)?.title ?? id;

  const base = (await generateCandidates(req, adapters))[0];
  const baseIds = new Set(base?.includedOpportunityIds ?? []);

  const options: DateOption[] = [];
  for (let i = 0; i < maxOptions; i++) {
    const start = addDays(req.window.earliestStart, i * step);
    if (start > req.window.latestEnd) break;
    const shifted: SynthesisRequest = { ...req, window: { ...req.window, earliestStart: start } };
    const best = (await generateCandidates(shifted, adapters))[0];
    if (!best) continue;
    const ids = new Set(best.includedOpportunityIds);
    options.push({
      startDate: best.startDate,
      bestAmbiance: best.label,
      score: best.score,
      includedCount: best.includedOpportunityIds.length,
      caniculeDays: best.caniculeExposureDays,
      unlocked: [...ids].filter(id => !baseIds.has(id)).map(titleOf),
      lost: [...baseIds].filter(id => !ids.has(id)).map(titleOf),
    });
  }
  return options;
}
