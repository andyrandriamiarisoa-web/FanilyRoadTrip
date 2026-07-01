import { describe, it, expect } from "vitest";
import { shareTripUrl, decodeTripFromUrl } from "./export";
import type { TripPlan } from "@/types";

const plan: TripPlan = {
  id: "composed-le-decouvreur-42",
  version: 1,
  createdAt: "2026-07-01T18:04:11.057Z",
  profileId: "famille-default",
  tripRequest: {
    origin: "Fresnes", originLat: 48.75, originLng: 2.32,
    destination: "Marseille", destinationLat: 43.3, destinationLng: 5.37,
    departureFrom: "2026-07-31", departureTo: "2026-07-31", maxDays: 11, fixedEvents: [],
  },
  days: Array.from({ length: 17 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    type: "drive" as const,
    location: "Dijon",
    workStatus: "none" as const,
    notes: [],
    heatAdvisory: true,
  })),
  totalDistanceKm: 2005,
  totalDrivingMinutes: 1504,
  lodgingSelections: {},
  budgetEstimate: { lodgingTotal: 0, chargingTotal: 0 },
  feasible: true,
  conflicts: [],
  agentLog: [],
};

// `window` pour shareTripUrl (origin).
const g = globalThis as unknown as { window?: { location: { origin: string } } };

describe("partage du carnet — round-trip URL", () => {
  it("shareTripUrl → decodeTripFromUrl restitue le voyage", () => {
    g.window = { location: { origin: "https://familyroadtrips.vercel.app" } };
    const url = shareTripUrl(plan);
    expect(url).toContain("/carnet?trip=");
    const encoded = url.split("trip=")[1];
    const decoded = decodeTripFromUrl(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(plan.id);
    expect(decoded!.days).toHaveLength(17);
  });

  it("survit à la corruption « + » → espace de la query string (URLSearchParams)", () => {
    g.window = { location: { origin: "https://familyroadtrips.vercel.app" } };
    const encoded = shareTripUrl(plan).split("trip=")[1];
    // Simule la lecture navigateur : dans une query string, « + » devient espace.
    const url = new URL(`https://x/carnet?trip=${encoded}`);
    const asRead = url.searchParams.get("trip")!;
    const decoded = decodeTripFromUrl(asRead);
    expect(decoded, "un lien partagé doit se décoder même après + → espace").not.toBeNull();
    expect(decoded!.id).toBe(plan.id);
  });

  it("retourne null (jamais d'exception) sur un payload invalide", () => {
    expect(decodeTripFromUrl("pas-du-lz-string")).toBeNull();
    expect(decodeTripFromUrl("")).toBeNull();
  });
});
