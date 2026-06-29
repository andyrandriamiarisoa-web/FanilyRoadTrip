import { describe, it, expect } from "vitest";
import { layoutAligned } from "./optimizer";
import { selectOptimal } from "./optimizer";
import { haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import type { Anchor, Opportunity, VacationWindow, HouseholdConstraints } from "./types";

const adapters: SynthesisAdapters = {
  travel: {
    async estimate(from, to) {
      const km = haversineKm(from, to);
      return {
        minutes: Math.round((km / 90) * 60),
        chargeStops: Math.floor(km / 250),
        sourceStatus: "estimated",
      };
    },
  },
  canicule: { async isHeatAlert() { return false; } },
};

const FRESNES = { lat: 48.75, lng: 2.32 };
const MARSEILLE = { lat: 43.3, lng: 5.37 };
const DIJON = { lat: 47.32, lng: 5.04 };
const AVIGNON = { lat: 43.95, lng: 4.81 };

const anchor: Anchor = {
  id: "anniv", kind: "event", title: "Anniversaire mariage",
  location: MARSEILLE, start: "2026-08-08T10:00:00", end: "2026-08-08T14:30:00",
  source: "saisie utilisateur", sourceStatus: "verified",
};

const window: VacationWindow = {
  origin: FRESNES, earliestStart: "2026-07-31", latestEnd: "2026-08-16",
  minNights: 15, maxNights: 16,
};

const constraints: HouseholdConstraints = {
  babyPauseEveryMin: 120, babyPauseDurationMin: 15, maxDrivePerDayMin: 300,
  workDays: [1, 2, 3, 4], workStart: "08:30", workEnd: "19:00",
  caniculeNoDrive: { start: "12:00", end: "16:00" },
};

const forcedDijon: Opportunity = {
  id: "user-stop-0-dijon", title: "Dijon (étape · 2 nuits)", category: "attraction",
  location: DIJON, score: 1, durationMin: 180, indoor: false, babyFriendly: true,
  source: "saisie utilisateur", sourceStatus: "verified", forced: true, stayNights: 2,
};

const optionalEvent: Opportunity = {
  id: "evt-avignon", title: "Spectacle (Avignon)", category: "event",
  location: AVIGNON, score: 0.8, durationMin: 150, indoor: true,
  source: "OpenAgenda", sourceStatus: "verified",
};

describe("selectOptimal — étape garantie jamais arbitrée", () => {
  it("retient toujours une opportunité forced, même sous budget serré", () => {
    // Budget minuscule : sans le mécanisme forced, le knapsack la jetterait.
    const selected = selectOptimal({
      pool: [optionalEvent],          // optionnel
      people: [forcedDijon],          // forced rangé dans le bucket « toujours retenu »
      weightOf: () => 0.1,
      budgetMin: 50,                   // < durationMin de Dijon (180)
    });
    expect(selected.map((o) => o.id)).toContain("user-stop-0-dijon");
  });
});

describe("layoutAligned — étape garantie", () => {
  it("place Dijon (visite + 2 nuits sur place) et la compte dans includedOpportunityIds", async () => {
    const selected = [forcedDijon, optionalEvent];
    const cand = await layoutAligned(
      { anchor, selected, window, constraints, ambiance: "decouvreur", label: "T" },
      adapters,
    );

    // Dijon est honorée (anti-pattern : jamais d'abandon silencieux).
    expect(cand.includedOpportunityIds).toContain("user-stop-0-dijon");

    // Au moins une visite à Dijon.
    const visitDays = cand.days.filter((d) =>
      d.stops.some((s) => s.kind === "visit" && s.opportunityId === "user-stop-0-dijon"),
    );
    expect(visitDays.length).toBeGreaterThan(0);

    // Au moins 2 nuits passées à Dijon (le foyer reste sur place).
    const nightsAtDijon = cand.days.filter((d) =>
      d.stops.some(
        (s) =>
          s.kind === "night" &&
          s.location &&
          Math.abs(s.location.lat - DIJON.lat) < 0.05 &&
          Math.abs(s.location.lng - DIJON.lng) < 0.05,
      ),
    );
    expect(nightsAtDijon.length).toBeGreaterThanOrEqual(2);

    // Pas de conflit « non placée » pour Dijon.
    expect(cand.conflicts.some((c) => /Dijon/.test(c) && /non placée/.test(c))).toBe(false);
  });

  it("ramène le foyer au point de départ le dernier jour (jamais bloqué à l'ancre)", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [forcedDijon], window, constraints, ambiance: "decouvreur", label: "T" },
      adapters,
    );
    const lastDay = cand.days[cand.days.length - 1];
    // Le dernier jour contient un trajet de retour OU une nuit à la maison,
    // localisé au point de départ (Fresnes), pas à l'ancre (Marseille).
    const homeStop = lastDay.stops.find(
      (s) =>
        (s.kind === "drive" || s.kind === "night") &&
        s.location &&
        Math.abs(s.location.lat - FRESNES.lat) < 0.05 &&
        Math.abs(s.location.lng - FRESNES.lng) < 0.05,
    );
    expect(homeStop, "dernier jour ramené à l'origine").toBeDefined();
    // La toute dernière localisation du voyage est le point de départ.
    const lastLocated = [...lastDay.stops].reverse().find((s) => s.location)!;
    expect(Math.abs(lastLocated.location!.lat - FRESNES.lat)).toBeLessThan(0.05);
    expect(Math.abs(lastLocated.location!.lng - FRESNES.lng)).toBeLessThan(0.05);
  });

  it("signale explicitement une étape garantie infaisable (fenêtre trop courte)", async () => {
    // Fenêtre d'1 nuit autour de l'ancre : impossible de caser Dijon.
    const tightWindow: VacationWindow = {
      origin: FRESNES, earliestStart: "2026-08-08", latestEnd: "2026-08-09",
      minNights: 1, maxNights: 1,
    };
    const cand = await layoutAligned(
      { anchor, selected: [forcedDijon], window: tightWindow, constraints, ambiance: "decouvreur", label: "T" },
      adapters,
    );
    if (!cand.includedOpportunityIds.includes("user-stop-0-dijon")) {
      expect(cand.conflicts.some((c) => /Dijon|étape/i.test(c) && /non placée/i.test(c))).toBe(true);
    }
  });
});
