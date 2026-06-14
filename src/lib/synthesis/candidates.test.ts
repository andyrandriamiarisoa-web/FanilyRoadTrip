import { describe, it, expect } from "vitest";
import { generateCandidates } from "./candidates";
import { haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import { REFERENCE_REQUEST } from "@/data/synthesis-fixtures";

const adapters: SynthesisAdapters = {
  travel: { async estimate(from, to) { const km = haversineKm(from, to); return { minutes: Math.round((km/90)*60), chargeStops: Math.floor(km/250), sourceStatus: "estimated" }; } },
  canicule: { async isHeatAlert() { return false; } },
};

describe("generateCandidates", () => {
  it("renvoie plusieurs candidats triés et distincts", async () => {
    const cands = await generateCandidates(REFERENCE_REQUEST, adapters);
    expect(cands.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < cands.length; i++) expect(cands[i - 1].score).toBeGreaterThanOrEqual(cands[i].score);
    const signatures = cands.map(c => c.includedOpportunityIds.slice().sort().join(","));
    expect(new Set(signatures).size).toBeGreaterThan(1); // au moins deux voyages qualitativement différents
  });

  it("tisse une personne du corridor dans le voyage Sociable (S5)", async () => {
    const cands = await generateCandidates(REFERENCE_REQUEST, adapters);
    const sociable = cands.find(c => c.label === "Le Sociable");
    expect(sociable).toBeDefined();
    expect(sociable!.includedOpportunityIds).toContain("marie-lyon");
  });
});
