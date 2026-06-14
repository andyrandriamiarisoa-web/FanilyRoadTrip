import type { SynthesisRequest, TripCandidate, Ambiance, Opportunity } from "./types";
import type { SynthesisAdapters } from "./adapters";
import { layout } from "./solver";
import { opportunityWeight, scoreCandidate } from "./scoring";

const AMBIANCE_LABELS: Record<Ambiance, string> = {
  reposant: "Le Reposant", sociable: "Le Sociable", decouvreur: "Le Découvreur", theme: "Le Thématique",
};

// Classe (sans exclure) puis retient un sous-ensemble selon l'ambiance.
// Le reste des opportunités demeure consultable ailleurs dans l'app (anti-pattern #1).
function pickForAmbiance(req: SynthesisRequest, ambiance: Ambiance): Opportunity[] {
  const pool = [...(req.opportunities ?? []), ...(req.people ?? [])];
  const ranked = pool
    .map(o => ({ o, w: opportunityWeight(o, ambiance, req.themeCategory) }))
    .sort((a, b) => b.w - a.w);
  const maxVisits = Math.max(3, Math.round(req.window.maxNights * (ambiance === "reposant" ? 0.6 : 1.2)));
  return ranked.slice(0, maxVisits).map(r => r.o);
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
    const cand = await layout(
      { anchor, selected, window: req.window, constraints: req.constraints, ambiance, label: AMBIANCE_LABELS[ambiance], pool },
      adapters,
    );
    cand.score = scoreCandidate(cand, ambiance);
    out.push(cand);
  }
  return out.sort((a, b) => b.score - a.score);
}
