import { describe, it, expect } from "vitest";
import {
  candidateToTripPlan,
  draftToTripPlan,
} from "./build-trip-plan";
import { nightsFromIntent, type AnchoredFormState, type PlannedFormState } from "./types";
import type { TripCandidate } from "@/lib/synthesis/types";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";

const anchoredForm: AnchoredFormState = {
  mode: "anchored",
  anchorTitle: "Séminaire",
  anchorCity: "Marseille",
  anchorStartDate: "2026-08-05",
  anchorEndDate: "2026-08-08",
  anchorStartTime: "09:00",
  anchorEndTime: "18:00",
  originCity: "Paris",
  earliestStart: "2026-08-01",
  latestEnd: "2026-08-14",
  intent: "maximize",
  minNights: 1,
  maxNights: 1,
  stops: [],
};

const plannedForm: PlannedFormState = {
  mode: "planned",
  origin: "Paris",
  destination: "Marseille",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-07",
  stops: [],
  desires: "",
};

function makeCandidate(): TripCandidate {
  return {
    ambiance: "decouvreur",
    label: "Le Découvreur",
    startDate: "2026-08-03",
    endDate: "2026-08-10",
    days: [
      {
        date: "2026-08-03",
        isWorkday: true,
        driveMinutes: 0,
        stops: [
          { kind: "work", title: "Télétravail", start: "2026-08-03T06:30:00Z", end: "2026-08-03T17:00:00Z", location: { lat: 48.86, lng: 2.35 } },
          { kind: "night", title: "Nuit (workation)", start: "2026-08-03T20:00:00Z", end: "2026-08-04T07:00:00Z", location: { lat: 48.86, lng: 2.35 } },
        ],
      },
      {
        date: "2026-08-05",
        isWorkday: true,
        driveMinutes: 240,
        stops: [
          { kind: "drive", title: "Trajet vers Séminaire", start: "2026-08-05T08:00:00Z", end: "2026-08-05T12:00:00Z", location: { lat: 43.30, lng: 5.37 } },
          { kind: "anchor", title: "Séminaire", start: "2026-08-05T07:00:00Z", end: "2026-08-05T16:00:00Z", location: { lat: 43.30, lng: 5.37 } },
          { kind: "night", title: "Nuit (proximité événement)", start: "2026-08-05T18:00:00Z", end: "2026-08-06T07:00:00Z", location: { lat: 43.30, lng: 5.37 } },
        ],
      },
    ],
    includedOpportunityIds: [],
    totalDriveMinutes: 240,
    score: 0.8,
    conflicts: [],
    caniculeExposureDays: 0,
  };
}

describe("candidateToTripPlan", () => {
  it("convertit chaque PlannedDay en DayPlan avec coords pour le refresh dispos", () => {
    const plan = candidateToTripPlan(makeCandidate(), anchoredForm, {
      profileId: "famille-default",
    });
    expect(plan.days).toHaveLength(2);

    // Jour 1 : télétravail à Paris → lodging à Paris avec coords.
    expect(plan.days[0].type).toBe("work");
    expect(plan.days[0].lodging?.lat).toBeCloseTo(48.86, 1);
    expect(plan.days[0].lodging?.lng).toBeCloseTo(2.35, 1);

    // Jour 2 : événement (anchor) → type "event" + coords Marseille.
    expect(plan.days[1].type).toBe("event");
    expect(plan.days[1].lodging?.lat).toBeCloseTo(43.30, 1);
    expect(plan.days[1].lodging?.lng).toBeCloseTo(5.37, 1);
  });

  it("conserve les conflits du candidat (anti-pattern #3 — honnêteté)", () => {
    const c = makeCandidate();
    c.conflicts = ["Fenêtre trop courte pour le retour"];
    const plan = candidateToTripPlan(c, anchoredForm, { profileId: "fam" });
    expect(plan.feasible).toBe(false);
    expect(plan.conflicts).toEqual(["Fenêtre trop courte pour le retour"]);
  });

  it("n'invente jamais un prix d'hébergement", () => {
    const plan = candidateToTripPlan(makeCandidate(), anchoredForm, {
      profileId: "fam",
    });
    for (const d of plan.days) {
      if (d.lodging) expect(d.lodging.priceTotal).toBe(0);
    }
    expect(plan.budgetEstimate).toEqual({ lodgingTotal: 0, chargingTotal: 0 });
  });
});

describe("draftToTripPlan", () => {
  it("convertit un AiItineraryDraft en TripPlan avec géocodage seed", () => {
    const draft: AiItineraryDraft = {
      destination: "Marseille",
      summary: "Voyage cool",
      days: [
        {
          date: "2026-08-01",
          title: "Départ Paris",
          activities: ["Marche tranquille"],
          lodgingHint: "Hôtel à Paris (matelas ferme, bureau)",
          constraintNotes: [],
        },
        {
          date: "2026-08-04",
          title: "Visite Lyon",
          drivingFromTo: "Paris → Lyon",
          activities: ["Halles de Lyon"],
          lodgingHint: "Hôtel à Lyon avec clim",
          constraintNotes: ["Canicule prévue 12h–16h — bloc évité"],
        },
      ],
      constraintsApplied: ["bébé", "télétravail"],
    };
    const plan = draftToTripPlan(draft, plannedForm, { profileId: "fam" });
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].location).toBe("Paris");
    expect(plan.days[0].lodging?.lat).toBeCloseTo(48.86, 1);
    expect(plan.days[1].location).toBe("Lyon");
    expect(plan.days[1].lodging?.lat).toBeCloseTo(45.75, 1);
    expect(plan.days[1].type).toBe("drive");
    expect(plan.days[1].heatAdvisory).toBe(true);
  });

  it("revient à la destination si le hint n'évoque aucune ville connue", () => {
    const draft: AiItineraryDraft = {
      destination: "Marseille",
      summary: "",
      days: [
        {
          date: "2026-08-05",
          title: "Visite",
          activities: [],
          lodgingHint: "Une auberge sympa quelque part",
          constraintNotes: [],
        },
      ],
      constraintsApplied: [],
    };
    const plan = draftToTripPlan(draft, plannedForm, { profileId: "fam" });
    expect(plan.days[0].location).toBe("Marseille");
    expect(plan.days[0].lodging?.lat).toBeCloseTo(43.30, 1);
  });
});

describe("nightsFromIntent — traduction intention → bornes", () => {
  it("maximize : prend toute la fenêtre disponible", () => {
    const { minNights, maxNights } = nightsFromIntent({
      intent: "maximize",
      earliestStart: "2026-08-01",
      latestEnd: "2026-08-15",
      anchorStartDate: "2026-08-08",
      anchorEndDate: "2026-08-08",
      minNights: 1,
      maxNights: 1,
    });
    // Fenêtre = 15 jours = 14 nuits possibles
    expect(maxNights).toBe(14);
    expect(minNights).toBeGreaterThanOrEqual(13);
  });

  it("fastest : ancre + 1 nuit (aller-retour minimum)", () => {
    const { minNights, maxNights } = nightsFromIntent({
      intent: "fastest",
      earliestStart: "2026-08-01",
      latestEnd: "2026-08-15",
      anchorStartDate: "2026-08-05",
      anchorEndDate: "2026-08-08",
      minNights: 1,
      maxNights: 1,
    });
    // anchorDays = 4 → anchorNights = 3 → fastest = 3+1 = 4 nuits min
    expect(minNights).toBe(4);
    expect(maxNights).toBeGreaterThanOrEqual(4);
    expect(maxNights).toBeLessThanOrEqual(14);
  });

  it("custom : respecte les bornes saisies par l'utilisateur", () => {
    const { minNights, maxNights } = nightsFromIntent({
      intent: "custom",
      earliestStart: "2026-08-01",
      latestEnd: "2026-08-15",
      anchorStartDate: "2026-08-08",
      anchorEndDate: "2026-08-08",
      minNights: 5,
      maxNights: 8,
    });
    expect(minNights).toBe(5);
    expect(maxNights).toBe(8);
  });

  it("custom : corrige max < min", () => {
    const { minNights, maxNights } = nightsFromIntent({
      intent: "custom",
      earliestStart: "2026-08-01",
      latestEnd: "2026-08-15",
      anchorStartDate: "2026-08-08",
      anchorEndDate: "2026-08-08",
      minNights: 7,
      maxNights: 3, // incohérent
    });
    expect(minNights).toBe(7);
    expect(maxNights).toBe(7); // recalé au min
  });
});
