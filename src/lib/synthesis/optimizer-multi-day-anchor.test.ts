import { describe, it, expect } from "vitest";
import { layoutAligned } from "./optimizer";
import { haversineKm } from "./solver";
import type { SynthesisAdapters } from "./adapters";
import type { Anchor, SynthesisRequest } from "./types";
import { REFERENCE_REQUEST, REFERENCE_ANCHOR } from "@/data/synthesis-fixtures";

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

describe("layoutAligned — ancre multi-jour", () => {
  it("couvre un séjour multi-jour comme présence MINIMALE (basé sur place, libre)", async () => {
    // Séjour de 5 jours du 5 au 9 août.
    const multiDayAnchor: Anchor = {
      ...REFERENCE_ANCHOR,
      id: "multi-day-event",
      title: "Séjour d'entreprise",
      start: "2026-08-05T09:00:00+02:00",
      end: "2026-08-09T18:00:00+02:00",
    };
    const req: SynthesisRequest = {
      ...REFERENCE_REQUEST,
      anchors: [multiDayAnchor],
    };

    const cand = await layoutAligned(
      {
        anchor: multiDayAnchor,
        selected: req.opportunities,
        window: req.window,
        constraints: req.constraints,
        ambiance: "decouvreur",
        label: "T",
      },
      adapters,
    );

    const anchorDates = ["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
    const blockDays = anchorDates.map((date) => cand.days.find((d) => d.date === date)!);
    for (const d of blockDays) expect(d).toBeDefined();

    // Présence GARANTIE (minimale) : chaque nuit du bloc est passée à l'ancre.
    for (const d of blockDays) {
      const night = d.stops.find((s) => s.kind === "night");
      expect(night?.location?.lat).toBeCloseTo(multiDayAnchor.location.lat, 2);
    }
    // L'événement est épinglé (au moins un stop d'ancre sur le bloc, dont le 1er jour).
    expect(blockDays[0].stops.some((s) => s.kind === "anchor")).toBe(true);

    // Pas EXCLUSIF : les jours intermédiaires ne sont PAS collés à l'ancre 09–18h —
    // le foyer explore à proximité (au moins une visite pendant le séjour).
    const innerVisits = ["2026-08-06", "2026-08-07", "2026-08-08"]
      .map((date) => cand.days.find((d) => d.date === date)!)
      .reduce((n, d) => n + d.stops.filter((s) => s.kind === "visit").length, 0);
    expect(innerVisits).toBeGreaterThan(0);
  });

  it("ne fait pas conduire le foyer pendant le bloc d'ancre", async () => {
    const multiDayAnchor: Anchor = {
      ...REFERENCE_ANCHOR,
      id: "multi-day-event",
      title: "Séjour famille",
      start: "2026-08-05T10:00:00+02:00",
      end: "2026-08-08T17:00:00+02:00",
    };
    const cand = await layoutAligned(
      {
        anchor: multiDayAnchor,
        selected: REFERENCE_REQUEST.opportunities,
        window: REFERENCE_REQUEST.window,
        constraints: REFERENCE_REQUEST.constraints,
        ambiance: "reposant",
        label: "T",
      },
      adapters,
    );

    // Aucun stop "drive" sur les jours intérieurs du bloc (06 et 07 août).
    // Le premier jour (05/08) peut contenir le trajet d'arrivée — c'est OK.
    const innerDays = ["2026-08-06", "2026-08-07"];
    for (const date of innerDays) {
      const day = cand.days.find((d) => d.date === date);
      expect(day).toBeDefined();
      expect(day!.driveMinutes).toBe(0);
      expect(day!.stops.some((s) => s.kind === "drive")).toBe(false);
    }
  });

  it("loge le foyer à proximité de l'ancre pendant tout le bloc", async () => {
    const multiDayAnchor: Anchor = {
      ...REFERENCE_ANCHOR,
      start: "2026-08-05T10:00:00+02:00",
      end: "2026-08-07T17:00:00+02:00",
    };
    const cand = await layoutAligned(
      {
        anchor: multiDayAnchor,
        selected: REFERENCE_REQUEST.opportunities,
        window: REFERENCE_REQUEST.window,
        constraints: REFERENCE_REQUEST.constraints,
        ambiance: "decouvreur",
        label: "T",
      },
      adapters,
    );

    const blockDates = ["2026-08-05", "2026-08-06", "2026-08-07"];
    for (const date of blockDates) {
      const day = cand.days.find((d) => d.date === date)!;
      const night = day.stops.find((s) => s.kind === "night");
      expect(night, `night sur ${date}`).toBeDefined();
      expect(night!.location?.lat).toBeCloseTo(multiDayAnchor.location.lat, 3);
      expect(night!.location?.lng).toBeCloseTo(multiDayAnchor.location.lng, 3);
    }
  });

  it("ancre 1 jour : comportement inchangé (rétrocompatible)", async () => {
    const cand = await layoutAligned(
      {
        anchor: REFERENCE_ANCHOR,
        selected: REFERENCE_REQUEST.opportunities,
        window: REFERENCE_REQUEST.window,
        constraints: REFERENCE_REQUEST.constraints,
        ambiance: "decouvreur",
        label: "T",
      },
      adapters,
    );
    const anchorDate = REFERENCE_ANCHOR.start.slice(0, 10);
    const anchorDay = cand.days.find((d) =>
      d.stops.some((s) => s.kind === "anchor"),
    );
    expect(anchorDay?.date).toBe(anchorDate);
    // Une seule journée porte un stop d'ancre (1 jour total).
    const count = cand.days.filter((d) => d.stops.some((s) => s.kind === "anchor")).length;
    expect(count).toBe(1);
  });
});

describe("layoutAligned — pas de constante 14 codée en dur", () => {
  it("honore minNights/maxNights pour un voyage court", async () => {
    const req: SynthesisRequest = {
      ...REFERENCE_REQUEST,
      window: {
        ...REFERENCE_REQUEST.window,
        earliestStart: "2026-08-06",
        latestEnd: "2026-08-10",
        minNights: 2,
        maxNights: 3,
      },
    };
    const cand = await layoutAligned(
      {
        anchor: REFERENCE_ANCHOR, // 8 août
        selected: req.opportunities,
        window: req.window,
        constraints: req.constraints,
        ambiance: "decouvreur",
        label: "T",
      },
      adapters,
    );
    // Avec minNights=2, maxNights=3, l'ancien `Math.max(14, …)` aurait
    // produit un voyage ≥ 14 nuits (impossible). Maintenant, le voyage
    // respecte les bornes (ou est ajusté à la fenêtre, conflit signalé).
    const days = cand.days.length;
    expect(days).toBeLessThanOrEqual(5); // 2026-08-06 → 2026-08-10 inclus
    expect(days).toBeGreaterThanOrEqual(2);
  });
});
