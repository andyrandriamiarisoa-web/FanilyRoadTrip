import type { SynthesisRequest, TripCandidate, Ambiance, Opportunity } from "./types";
import type { SynthesisAdapters } from "./adapters";
import { opportunityWeight, scoreCandidate } from "./scoring";
import { selectOptimal, layoutAligned } from "./optimizer";

const AMBIANCE_LABELS: Record<Ambiance, string> = {
  reposant: "Le Reposant", sociable: "Le Sociable", decouvreur: "Le Découvreur", theme: "Le Thématique",
};

/** Part du temps de visite disponible allouée selon l'ambiance (le Reposant en fait moins). */
const AMBIANCE_BUDGET_RATIO: Record<Ambiance, number> = {
  reposant: 0.4, sociable: 0.7, decouvreur: 0.75, theme: 0.7,
};

/**
 * Sélection **optimale** (S7) par ambiance : personnes forcées (ancres souples),
 * puis sac à dos sur le reste sous un budget de temps dépendant de l'ambiance.
 * On **classe sans exclure** (le reste du pool reste consultable ailleurs).
 */
function pickForAmbiance(req: SynthesisRequest, ambiance: Ambiance): Opportunity[] {
  const nonPeople = req.opportunities ?? [];
  const people = req.people ?? [];
  const nonPeopleCost = nonPeople.reduce((s, o) => s + o.durationMin, 0);
  const peopleCost = people.reduce((s, o) => s + o.durationMin, 0);
  const budgetMin = peopleCost + Math.round(nonPeopleCost * AMBIANCE_BUDGET_RATIO[ambiance]);
  return selectOptimal({
    pool: nonPeople,
    people,
    weightOf: (o) => opportunityWeight(o, ambiance, req.themeCategory),
    budgetMin,
  });
}

export async function generateCandidates(req: SynthesisRequest, adapters: SynthesisAdapters): Promise<TripCandidate[]> {
  if (req.anchors.length === 0) throw new Error("Au moins une ancre est requise pour la synthèse.");
  const anchor = [...req.anchors].sort((a, b) => a.start.localeCompare(b.start))[0];
  const pool = [...(req.opportunities ?? []), ...(req.people ?? [])];
  const ambiances: Ambiance[] = req.themeCategory
    ? ["reposant", "sociable", "decouvreur", "theme"]
    : ["reposant", "sociable", "decouvreur"];

  const out: TripCandidate[] = [];
  for (const ambiance of ambiances) {
    const selected = pickForAmbiance(req, ambiance);
    const cand = await layoutAligned(
      { anchor, selected, window: req.window, constraints: req.constraints, ambiance, label: AMBIANCE_LABELS[ambiance], pool },
      adapters,
    );
    cand.score = scoreCandidate(cand, ambiance);
    out.push(cand);
  }
  return out.sort((a, b) => b.score - a.score);
}
