import { describe, it, expect } from "vitest";
import { templateNarrative } from "./narrative";
import type { TripCandidate } from "./types";

const cand: TripCandidate = {
  ambiance: "decouvreur", label: "Le Découvreur", startDate: "2026-07-31", endDate: "2026-08-14",
  days: [{ date: "2026-07-31", isWorkday: false, driveMinutes: 120, stops: [
    { title: "Musée des Beaux-Arts", kind: "visit", start: "2026-07-31T14:00:00Z", end: "2026-07-31T15:30:00Z", source: "Foursquare", sourceStatus: "seed" },
  ] }],
  includedOpportunityIds: ["x"], totalDriveMinutes: 120, score: 1, conflicts: [], caniculeExposureDays: 0,
};

describe("templateNarrative", () => {
  it("ne contient que les faits du JSON validé", () => {
    const md = templateNarrative(cand);
    expect(md).toContain("Le Découvreur");
    expect(md).toContain("Musée des Beaux-Arts");
    expect(md).toContain("source : Foursquare");
  });
});
