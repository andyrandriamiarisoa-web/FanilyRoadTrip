import { describe, it, expect } from "vitest";
import { buildDebugTrace, debugTraceFilename } from "./debug-trace";
import {
  buildSynthesisRequest,
  buildItineraryRequestBody,
} from "./request-builders";
import type { AnchoredFormState, PlannedFormState, SavedTrip } from "./types";
import { DEFAULT_FAMILY_PROFILE } from "@/data/default-profile";
import type { TripPlan } from "@/types";

const profile = DEFAULT_FAMILY_PROFILE;

const anchoredForm: AnchoredFormState = {
  mode: "anchored",
  anchorTitle: "Séminaire",
  anchorCity: "Marseille",
  anchorStartDate: "2026-08-08",
  anchorEndDate: "2026-08-12", // séjour de 4 nuits sur l'ancre
  anchorStartTime: "09:00",
  anchorEndTime: "18:00",
  originCity: "Paris",
  earliestStart: "2026-08-01",
  latestEnd: "2026-08-20",
  intent: "maximize",
  minNights: 7,
  maxNights: 10,
  stops: [{ city: "Lyon", nights: 1, fixedDate: null }],
};

const plannedForm: PlannedFormState = {
  mode: "planned",
  origin: "Paris",
  destination: "Marseille",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-07",
  stops: [],
  desires: "nature",
};

function tripPlan(id = "composed-x"): TripPlan {
  return {
    id,
    version: 1,
    createdAt: "2026-06-25T10:00:00.000Z",
    profileId: profile.id,
    tripRequest: {
      origin: "Paris",
      originLat: 48.86,
      originLng: 2.35,
      destination: "Marseille",
      destinationLat: 43.3,
      destinationLng: 5.37,
      departureFrom: "2026-08-01",
      departureTo: "2026-08-01",
      maxDays: 14,
      fixedEvents: [],
    },
    days: [
      {
        date: "2026-08-08",
        type: "event",
        location: "Marseille",
        notes: [],
        lodging: {
          id: "x",
          name: "Hôtel",
          address: "Marseille",
          lat: 43.3,
          lng: 5.37,
          priceTotal: 0,
          nights: 1,
          amenities: { ac: false, parking: false, evCharger: false, desk: false },
          toConfirm: [],
          sourceStatus: "estimated",
          tier: "best",
        },
      },
    ],
    totalDistanceKm: 800,
    totalDrivingMinutes: 480,
    lodgingSelections: {},
    budgetEstimate: { lodgingTotal: 0, chargingTotal: 0 },
    feasible: true,
    conflicts: [],
    agentLog: [],
  } as unknown as TripPlan;
}

function savedTrip(over: Partial<SavedTrip> = {}): SavedTrip {
  return {
    id: "st_1",
    name: "Séminaire (Marseille)",
    status: "validated",
    mode: "anchored",
    formState: anchoredForm,
    candidates: [{ label: "Le Découvreur", startDate: "2026-08-05" }, { label: "Le Reposant" }],
    selectedCandidateIdx: 0,
    dateOptions: [],
    // Requête effective persistée (sinon un avertissement « non persistée » est émis).
    effectiveSynthesisRequest: { anchors: [], opportunities: [], window: {} },
    promotedTripPlanId: "composed-x",
    promotedAt: "2026-06-25T09:00:00.000Z",
    createdAt: "2026-06-24T09:00:00.000Z",
    updatedAt: "2026-06-25T09:00:00.000Z",
    ...over,
  };
}

describe("buildSynthesisRequest — parité avec le formulaire Mode B", () => {
  it("construit une requête déterministe avec ancre multi-jour", () => {
    const out = buildSynthesisRequest(anchoredForm, profile);
    expect(out.error).toBeNull();
    expect(out.request).not.toBeNull();
    expect(out.effectiveAnchorEnd).toBe("2026-08-12");
    // L'ancre porte start/end couvrant le bloc.
    expect(out.request!.anchors[0].start).toBe("2026-08-08T09:00:00");
    expect(out.request!.anchors[0].end).toBe("2026-08-12T18:00:00");
    // Étape Lyon géocodée en opportunité.
    expect(out.request!.opportunities).toHaveLength(1);
    expect(out.unknownStops).toHaveLength(0);
  });

  it("remonte une erreur claire pour une ville d'ancre inconnue", () => {
    const out = buildSynthesisRequest(
      { ...anchoredForm, anchorCity: "Villeneuve-Imaginaire" },
      profile,
    );
    expect(out.request).toBeNull();
    expect(out.error).toMatch(/Ville inconnue pour l'ancre/);
  });

  it("signale les étapes non géocodables sans bloquer", () => {
    const out = buildSynthesisRequest(
      { ...anchoredForm, stops: [{ city: "ZoneInconnue42", nights: 1, fixedDate: null }] },
      profile,
    );
    expect(out.request).not.toBeNull();
    expect(out.unknownStops).toContain("ZoneInconnue42");
  });
});

describe("buildItineraryRequestBody — parité avec le formulaire Mode A", () => {
  it("assemble la description + contraintes + workDays", () => {
    const body = buildItineraryRequestBody(plannedForm, profile);
    expect(body.destination).toBe("Marseille");
    expect(body.dateFrom).toBe("2026-08-01");
    expect(body.description).toContain("Voyage de Paris à Marseille");
    expect(body.description).toContain("Envies : nature");
    expect(body.constraints.length).toBeGreaterThan(0);
    expect(body.workDays).toEqual(profile.work.workDays);
  });
});

describe("buildDebugTrace", () => {
  it("assemble un journal Mode B complet (inputs + requête + sorties + carnet)", () => {
    const trace = buildDebugTrace({
      savedTrip: savedTrip(),
      tripPlan: tripPlan(),
      profile,
      appMode: "mock",
      generatedAt: "2026-06-25T12:00:00.000Z",
    });
    expect(trace.schemaVersion).toBe(1);
    expect(trace.appMode).toBe("mock");
    expect(trace.inputs.formState.mode).toBe("anchored");
    // Requête reconstruite = synthèse, avec l'ancre multi-jour.
    const rec = trace.reconstructedRequest as { kind: string; effectiveAnchorEnd: string };
    expect(rec.kind).toBe("synthesis");
    expect(rec.effectiveAnchorEnd).toBe("2026-08-12");
    // Sorties : candidats persistés + sélection.
    expect(trace.engineOutputs.candidates).toHaveLength(2);
    expect(trace.engineOutputs.selectedCandidateIdx).toBe(0);
    expect((trace.engineOutputs.selectedCandidate as { label: string }).label).toBe("Le Découvreur");
    expect(trace.tripPlan?.id).toBe("composed-x");
    // Pas d'avertissement bloquant ici (profil non modifié après promotion).
    expect(trace.warnings).toHaveLength(0);
  });

  it("avertit quand le profil a été modifié après la promotion", () => {
    const drifted = { ...profile, version: 9, updatedAt: "2026-06-25T11:00:00.000Z" };
    const trace = buildDebugTrace({
      savedTrip: savedTrip(),
      tripPlan: tripPlan(),
      profile: drifted,
      appMode: "mock",
      generatedAt: "2026-06-25T12:00:00.000Z",
    });
    expect(trace.warnings.some((w) => /Profil Foyer a été modifié/.test(w))).toBe(true);
  });

  it("avertit quand le carnet affiché diffère du voyage promu", () => {
    const trace = buildDebugTrace({
      savedTrip: savedTrip(),
      tripPlan: tripPlan("autre-plan"),
      profile,
      appMode: "mock",
      generatedAt: "2026-06-25T12:00:00.000Z",
    });
    expect(trace.warnings.some((w) => /n'est pas celui promu/.test(w))).toBe(true);
  });

  it("gère un Mode A (brouillon IA)", () => {
    const st = savedTrip({
      mode: "planned",
      formState: plannedForm,
      candidates: undefined,
      selectedCandidateIdx: undefined,
      dateOptions: undefined,
      draft: {
        destination: "Marseille",
        summary: "x",
        days: [{ date: "2026-08-01", title: "J1", activities: [], lodgingHint: "Lyon", constraintNotes: [] }],
        constraintsApplied: [],
      },
      draftSource: "mock",
    });
    const trace = buildDebugTrace({
      savedTrip: st,
      tripPlan: tripPlan(),
      profile,
      appMode: "mock",
      generatedAt: "2026-06-25T12:00:00.000Z",
    });
    const rec = trace.reconstructedRequest as { kind: string };
    expect(rec.kind).toBe("itinerary");
    expect(trace.engineOutputs.draftSource).toBe("mock");
  });
});

describe("debugTraceFilename", () => {
  it("produit un nom de fichier .json stable et slugifié", () => {
    const name = debugTraceFilename({ name: "Séminaire (Marseille)" }, "2026-06-25T12:00:00.000Z");
    expect(name).toMatch(/^odyssee-debug-seminaire-marseille-2026-06-25T12-00-00\.json$/);
  });
});
