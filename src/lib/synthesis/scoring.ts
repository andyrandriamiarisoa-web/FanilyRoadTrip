import type { Opportunity, Ambiance, TripCandidate, OpportunityCategory } from "./types";

type Weights = { categoryBoost: Partial<Record<OpportunityCategory, number>>; drivePenalty: number; countBoost: number };

const AMBIANCE_WEIGHTS: Record<Ambiance, Weights> = {
  reposant:   { categoryBoost: { park: 0.3, water: 0.3, food: 0.1 }, drivePenalty: 1.5, countBoost: -0.2 },
  sociable:   { categoryBoost: { people: 0.8 }, drivePenalty: 0.6, countBoost: 0.1 },
  decouvreur: { categoryBoost: { museum: 0.4, attraction: 0.4, viewpoint: 0.2, event: 0.3 }, drivePenalty: 0.4, countBoost: 0.3 },
  theme:      { categoryBoost: {}, drivePenalty: 0.7, countBoost: 0.1 },
};

export function opportunityWeight(o: Opportunity, ambiance: Ambiance, themeCategory?: OpportunityCategory): number {
  const w = AMBIANCE_WEIGHTS[ambiance];
  let boost = w.categoryBoost[o.category] ?? 0;
  if (ambiance === "theme" && themeCategory && o.category === themeCategory) boost += 0.8;
  return o.score + boost;
}

export function scoreCandidate(c: TripCandidate, ambiance: Ambiance): number {
  const w = AMBIANCE_WEIGHTS[ambiance];
  const driveHours = c.totalDriveMinutes / 60;
  return c.includedOpportunityIds.length * (1 + w.countBoost) - driveHours * w.drivePenalty - c.conflicts.length * 2;
}
