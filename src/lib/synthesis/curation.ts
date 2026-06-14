import type { Opportunity, OpportunityCategory, LatLng } from "./types";
import { haversineKm } from "./solver";

export type SlotKind = "baby-pause" | "charge-stop" | "canicule" | "workday-family";

const SLOT_CATEGORIES: Record<SlotKind, OpportunityCategory[]> = {
  "baby-pause": ["park", "food", "playground"],
  "charge-stop": ["food", "viewpoint", "park"],
  "canicule": ["museum", "water", "attraction"],
  "workday-family": ["museum", "park", "attraction", "playground", "water"],
};

/** Classe (sans exclure) les opportunités proches adaptées à un créneau de contrainte. */
export function curateSlot(
  slot: SlotKind, near: LatLng, pool: Opportunity[], opts?: { radiusKm?: number; babyFriendly?: boolean },
): Opportunity[] {
  const cats = new Set(SLOT_CATEGORIES[slot]);
  const radius = opts?.radiusKm ?? 10;
  return pool
    .map(o => {
      const d = haversineKm(near, o.location);
      let s = o.score - d / radius; // proximité
      if (cats.has(o.category)) s += 0.5;
      if (slot === "canicule" && o.indoor) s += 0.4;
      if (opts?.babyFriendly && o.babyFriendly) s += 0.3;
      return { o, s };
    })
    .sort((a, b) => b.s - a.s) // tout est classé ; rien n'est exclu (anti-pattern #1)
    .map(r => r.o);
}
