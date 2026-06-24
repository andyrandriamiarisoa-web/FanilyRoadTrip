import { describe, it, expect } from "vitest";
import {
  suggestedTripName,
  slugCity,
  newSavedTripId,
  type PlannedFormState,
  type AnchoredFormState,
} from "./types";
import {
  plannedFormToTripRequest,
  anchoredFormToTripRequest,
  formStateToTripRequest,
} from "./promote";
import {
  nightsFromTripPlan,
  refreshLodgingForPlan,
  snapshotAgeHours,
} from "./refresh-lodging";
import type { TripPlan } from "@/types";

const plannedForm: PlannedFormState = {
  mode: "planned",
  origin: "Paris",
  destination: "Marseille",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-07",
  stops: [{ city: "Lyon", nights: 1, fixedDate: null }],
  desires: "",
};

const anchoredForm: AnchoredFormState = {
  mode: "anchored",
  anchorTitle: "Mariage Marie",
  anchorCity: "Marseille",
  anchorStartDate: "2026-08-08",
  anchorStartTime: "16:00",
  anchorEndTime: "23:30",
  originCity: "Paris",
  earliestStart: "2026-08-01",
  latestEnd: "2026-08-14",
  minNights: 7,
  maxNights: 10,
  stops: [
    { city: "Lyon", nights: 2, fixedDate: "2026-08-03" },
  ],
};

describe("suggestedTripName", () => {
  it("Mode A : origine → destination", () => {
    expect(suggestedTripName(plannedForm)).toBe("Paris → Marseille");
  });
  it("Mode A vide : libellé générique", () => {
    expect(
      suggestedTripName({ ...plannedForm, origin: "", destination: "" }),
    ).toBe("Voyage planifié");
  });
  it("Mode B : titre + ville", () => {
    expect(suggestedTripName(anchoredForm)).toBe("Mariage Marie (Marseille)");
  });
  it("Mode B vide : libellé générique", () => {
    expect(
      suggestedTripName({ ...anchoredForm, anchorTitle: "", anchorCity: "" }),
    ).toBe("Voyage avec ancre");
  });
});

describe("slugCity", () => {
  it("retire accents et normalise", () => {
    expect(slugCity("Saint-Étienne")).toBe("saint-etienne");
    expect(slugCity("Mâcon")).toBe("macon");
    expect(slugCity("Aix-en-Provence")).toBe("aix-en-provence");
  });
});

describe("newSavedTripId", () => {
  it("préfixé st_ et unique entre appels", () => {
    const a = newSavedTripId();
    const b = newSavedTripId();
    expect(a).toMatch(/^st_/);
    expect(b).toMatch(/^st_/);
    expect(a).not.toBe(b);
  });
});

describe("plannedFormToTripRequest", () => {
  it("convertit avec géocodage seed et étapes datées en fixedEvents", () => {
    const req = plannedFormToTripRequest({
      ...plannedForm,
      stops: [
        { city: "Lyon", nights: 1, fixedDate: "2026-08-03" },
        { city: "Avignon", nights: 1, fixedDate: null }, // pas de date → ignoré
      ],
    });
    expect(req.origin).toBe("Paris");
    expect(req.destination).toBe("Marseille");
    expect(req.originLat).toBeCloseTo(48.86, 1);
    expect(req.destinationLat).toBeCloseTo(43.30, 1);
    expect(req.maxDays).toBe(7); // 2026-08-01 → 2026-08-07 inclus
    expect(req.fixedEvents).toHaveLength(1);
    expect(req.fixedEvents[0].name).toBe("Étape Lyon");
    expect(req.fixedEvents[0].date).toBe("2026-08-03");
  });

  it("lève une erreur claire pour une ville inconnue", () => {
    expect(() =>
      plannedFormToTripRequest({ ...plannedForm, origin: "ZéroVille-inconnue" }),
    ).toThrow(/Ville inconnue/);
  });
});

describe("anchoredFormToTripRequest", () => {
  it("convertit l'ancre en fixedEvent avec heure décimale", () => {
    const req = anchoredFormToTripRequest(anchoredForm);
    expect(req.origin).toBe("Paris");
    expect(req.destination).toBe("Marseille");
    expect(req.fixedEvents).toHaveLength(2); // ancre + étape Lyon datée
    const anchor = req.fixedEvents.find((e) => e.id === "user-anchor")!;
    expect(anchor.hour).toBe(16); // "16:00"
    expect(anchor.requiresNightBefore).toBe(true);
    expect(anchor.location.lat).toBeCloseTo(43.30, 1);
  });

  it("borne maxDays au max(minNights+1, maxNights+1)", () => {
    const req = anchoredFormToTripRequest({
      ...anchoredForm,
      minNights: 5,
      maxNights: 12,
    });
    expect(req.maxDays).toBe(13);
  });
});

describe("formStateToTripRequest dispatcher", () => {
  it("route vers planned ou anchored selon mode", () => {
    expect(formStateToTripRequest(plannedForm).destination).toBe("Marseille");
    expect(formStateToTripRequest(anchoredForm).fixedEvents).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Refresh lodging
// ---------------------------------------------------------------------------

function makeTripPlan(): TripPlan {
  return {
    id: "trip-test",
    profileId: "famille-default",
    request: {
      origin: "Paris",
      originLat: 48.86,
      originLng: 2.35,
      destination: "Marseille",
      destinationLat: 43.30,
      destinationLng: 5.37,
      departureFrom: "2026-08-01",
      departureTo: "2026-08-01",
      maxDays: 7,
      fixedEvents: [],
    },
    days: [
      {
        date: "2026-08-01",
        type: "drive",
        location: "Lyon",
        notes: [],
        lodging: {
          id: "lodg-1",
          name: "Hôtel Lyon",
          city: "Lyon",
          lat: 45.75,
          lng: 4.84,
          stars: 3,
          priceTotal: 200,
          firmMattress: true,
          ac: true,
          fiber: true,
          deskLengthCm: 120,
          score: 0.8,
          sourceStatus: "estimated",
        },
      },
      {
        date: "2026-08-02",
        type: "rest",
        location: "Avignon",
        notes: [],
        lodging: {
          id: "lodg-2",
          name: "Hôtel Avignon",
          city: "Avignon",
          lat: 43.95,
          lng: 4.81,
          stars: 3,
          priceTotal: 180,
          firmMattress: true,
          ac: true,
          fiber: true,
          deskLengthCm: 120,
          score: 0.7,
          sourceStatus: "estimated",
        },
      },
      {
        // Sans lodging — ne doit pas être inclus dans les nuits à refresh.
        date: "2026-08-03",
        type: "drive",
        location: "Marseille",
        notes: [],
      },
    ],
    totalDistanceKm: 800,
    totalDrivingMinutes: 480,
    totalChargingMinutes: 30,
    feasible: true,
    conflicts: [],
  } as unknown as TripPlan;
}

describe("nightsFromTripPlan", () => {
  it("retient les jours avec lodging et coords", () => {
    const plan = makeTripPlan();
    const nights = nightsFromTripPlan(plan);
    expect(nights).toHaveLength(2);
    expect(nights[0]).toEqual({
      date: "2026-08-01",
      nextDate: "2026-08-02",
      city: "Lyon",
      lat: 45.75,
      lng: 4.84,
    });
    expect(nights[1].city).toBe("Avignon");
  });
});

describe("refreshLodgingForPlan", () => {
  it("appelle /api/lodging/availability pour chaque nuit et écrit un snapshot", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, body });
      return new Response(
        JSON.stringify({
          ok: true,
          offers: [{ id: "h1", name: "Hôtel", available: true }],
          sourceName: "mock",
          notes: [],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const fixedNow = new Date("2026-06-24T10:00:00.000Z");
    const out = await refreshLodgingForPlan(makeTripPlan(), {
      savedTripId: "st_test",
      fetchImpl: fakeFetch,
      now: () => fixedNow,
    });

    expect(calls).toHaveLength(2);
    expect(out.snapshots).toHaveLength(2);
    expect(out.errors).toHaveLength(0);
    expect(out.snapshots[0].id).toBe("st_test-2026-08-01-lyon");
    expect(out.snapshots[0].result.sourceName).toBe("mock");
    expect(out.snapshots[0].readAt).toBe("2026-06-24T10:00:00.000Z");
  });

  it("remonte les erreurs et continue les autres nuits", async () => {
    let nth = 0;
    const fakeFetch = (async () => {
      nth++;
      if (nth === 1) {
        return new Response(
          JSON.stringify({ ok: false, error: "Quota dépassé" }),
          { status: 429 },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, offers: [], sourceName: "mock", notes: [] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const out = await refreshLodgingForPlan(makeTripPlan(), {
      savedTripId: "st_test",
      fetchImpl: fakeFetch,
    });
    expect(out.snapshots).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].reason).toMatch(/Quota/);
  });
});

describe("snapshotAgeHours", () => {
  it("renvoie l'âge en heures, jamais négatif", () => {
    const snap = {
      id: "x",
      savedTripId: "st",
      date: "2026-08-01",
      city: "Lyon",
      lat: 0,
      lng: 0,
      result: { offers: [], sourceName: "mock", notes: [] },
      readAt: "2026-06-24T10:00:00.000Z",
    };
    expect(
      snapshotAgeHours(snap, new Date("2026-06-24T12:00:00.000Z")),
    ).toBeCloseTo(2);
    expect(
      snapshotAgeHours(snap, new Date("2026-06-24T08:00:00.000Z")),
    ).toBe(0);
    expect(snapshotAgeHours(null)).toBeNull();
  });
});
