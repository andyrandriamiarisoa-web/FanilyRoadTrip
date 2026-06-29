import { describe, it, expect } from "vitest";
import { templateNarrative } from "./narrative";
import type { TripCandidate } from "./types";

const DIJON = { lat: 47.32, lng: 5.04 };

const cand: TripCandidate = {
  ambiance: "decouvreur", label: "Le Découvreur", startDate: "2026-07-31", endDate: "2026-08-14",
  days: [{ date: "2026-07-31", isWorkday: false, driveMinutes: 120, stops: [
    { title: "Trajet vers Dijon (étape · 2 nuits)", kind: "drive", start: "2026-07-31T09:00:00Z", end: "2026-07-31T11:00:00Z", location: DIJON, sourceStatus: "estimated" },
    { title: "Musée des Beaux-Arts", kind: "visit", start: "2026-07-31T14:00:00Z", end: "2026-07-31T15:30:00Z", source: "Foursquare", sourceStatus: "seed" },
    { title: "Nuit (matelas ferme + clim)", kind: "night", start: "2026-07-31T20:00:00Z", end: "2026-08-01T09:00:00Z", location: DIJON },
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

  it("affiche les villes d'étape (trajet + nuit) pour qu'on sache de quoi on parle", () => {
    const md = templateNarrative(cand);
    // Le trajet nomme la ville de destination…
    expect(md).toContain("🚗 Route vers Dijon");
    // …et la nuit indique où l'on dort.
    expect(md).toMatch(/Nuit.*Dijon/);
  });

  it("affiche les temps de parcours (par jour + total) pour comparer les propositions", () => {
    const md = templateNarrative(cand);
    expect(md).toContain("2 h de route au total"); // total
    expect(md).toContain("🚗 2 h de route");        // en-tête de journée
  });
});
