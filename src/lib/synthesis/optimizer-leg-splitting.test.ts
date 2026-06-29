/**
 * Découpe des longs trajets (V4.1) — régression du cas réel signalé : un
 * Dijon→Marseille (~7 h 47) écrasé sur une seule journée, avec un foyer qui
 * croupissait 5 nuits à Dijon avant de foncer le jour de l'événement.
 *
 * Le solveur doit désormais :
 *   1. ne **jamais** dépasser le plafond de conduite/jour du Profil Foyer ;
 *   2. **arriver à l'ancre avant** son heure de début (pas de trajet qui
 *      chevauche l'événement) ;
 *   3. honorer **exactement** les nuits d'une étape garantie (pas d'entassement) ;
 *   4. **découper** un long trajet avec des nuits intermédiaires dans de
 *      **vraies villes** (géocodage inverse injecté) ;
 *   5. ramener le foyer **au point de départ** en fin de fenêtre.
 */

import { describe, it, expect } from "vitest";
import { layoutAligned } from "./optimizer";
import { haversineKm } from "./solver";
import { FRENCH_CITIES } from "@/data/cities";
import type { SynthesisAdapters, GeoProvider } from "./adapters";
import type { Anchor, Opportunity, VacationWindow, HouseholdConstraints, LatLng } from "./types";

// Adaptateur de voyage déterministe (vol d'oiseau à 90 km/h, comme les autres
// tests du solveur) + géocodage inverse sur la table seed des villes.
const geo: GeoProvider = {
  nearestCity(loc: LatLng) {
    let best: { name: string; location: LatLng; d2: number } | null = null;
    for (const c of FRENCH_CITIES) {
      const d2 = (c.lat - loc.lat) ** 2 + (c.lng - loc.lng) ** 2;
      if (!best || d2 < best.d2) best = { name: c.name, location: { lat: c.lat, lng: c.lng }, d2 };
    }
    return best ? { name: best.name, location: best.location } : null;
  },
};

const adapters: SynthesisAdapters = {
  travel: {
    async estimate(from, to) {
      const km = haversineKm(from, to);
      return { minutes: Math.round((km / 90) * 60), chargeStops: Math.floor(km / 250), sourceStatus: "estimated" };
    },
  },
  canicule: { async isHeatAlert() { return false; } },
  geo,
};

const FRESNES = { lat: 48.75, lng: 2.32 };
const MARSEILLE = { lat: 43.3, lng: 5.37 };
const DIJON = { lat: 47.32, lng: 5.04 };

// Profil-dérivé : maxSegmentMinutes 140 → maxDrivePerDayMin 280 (cf. request-builders).
const CAP = 280;
const constraints: HouseholdConstraints = {
  babyPauseEveryMin: 120, babyPauseDurationMin: 15, maxDrivePerDayMin: CAP,
  workDays: [1, 2, 3, 4], workStart: "08:30", workEnd: "19:00",
  caniculeNoDrive: { start: "12:00", end: "16:00" },
};

// Reproduit le log de debug : ancre multi-jour (anniversaire), étape Dijon 2 nuits.
const anchor: Anchor = {
  id: "anniv", kind: "event", title: "Anniversaire mariage", location: MARSEILLE,
  start: "2026-08-08T10:00:00", end: "2026-08-09T14:30:00",
  source: "saisie utilisateur", sourceStatus: "verified",
};
const window: VacationWindow = {
  origin: FRESNES, earliestStart: "2026-07-31", latestEnd: "2026-08-16", minNights: 15, maxNights: 16,
};
const dijon: Opportunity = {
  id: "user-stop-0-dijon", title: "Dijon (étape · 2 nuits)", category: "attraction",
  location: DIJON, score: 1, durationMin: 180, indoor: false, babyFriendly: true,
  source: "saisie utilisateur", sourceStatus: "verified", forced: true, stayNights: 2,
};

function nightsAt(days: Awaited<ReturnType<typeof layoutAligned>>["days"], loc: LatLng): number {
  return days.filter((d) =>
    d.stops.some((s) => s.kind === "night" && s.location
      && Math.abs(s.location.lat - loc.lat) < 0.05 && Math.abs(s.location.lng - loc.lng) < 0.05),
  ).length;
}

describe("layoutAligned — découpe des longs trajets (cap conduite/jour)", () => {
  it("ne dépasse JAMAIS le plafond de conduite quotidien", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [dijon], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    // C'est le cœur du correctif : plus aucune journée à 7 h 47 de route.
    for (const d of cand.days) {
      expect(d.driveMinutes, `jour ${d.date} : ${d.driveMinutes} min > ${CAP}`).toBeLessThanOrEqual(CAP);
    }
  });

  it("arrive à l'ancre avant son heure de début (pas de trajet sur l'événement)", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [dijon], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    // L'ancre est posée à sa date…
    const anchorDay = cand.days.find((d) => d.stops.some((s) => s.kind === "anchor"));
    expect(anchorDay?.date).toBe("2026-08-08");
    // …et le jour de l'événement ne contient AUCUN trajet (foyer arrivé la veille).
    expect(anchorDay!.driveMinutes).toBe(0);
    expect(anchorDay!.stops.some((s) => s.kind === "drive")).toBe(false);
    // Aucun conflit d'arrivée tardive / approche non terminée.
    expect(cand.conflicts.some((c) => /Approche|Arrivée/.test(c))).toBe(false);
  });

  it("honore EXACTEMENT les 2 nuits de l'étape Dijon (pas d'entassement)", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [dijon], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    // Avant le correctif, le foyer dormait 5 nuits à Dijon puis fonçait.
    expect(nightsAt(cand.days, DIJON)).toBe(2);
    expect(cand.includedOpportunityIds).toContain("user-stop-0-dijon");
  });

  it("découpe le trajet avec des nuits intermédiaires dans de vraies villes", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [dijon], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    // Au moins une nuit strictement entre Dijon et Marseille (étape de découpe).
    const intermediate = cand.days.filter((d) =>
      d.stops.some((s) => s.kind === "night" && s.location
        && s.location.lat < DIJON.lat - 0.1 && s.location.lat > MARSEILLE.lat + 0.1),
    );
    expect(intermediate.length).toBeGreaterThan(0);
    // Et cette nuit tombe sur une vraie ville connue (coord = ville seed).
    const someNight = intermediate[0].stops.find((s) => s.kind === "night" && s.location)!;
    const onCity = FRENCH_CITIES.some((c) =>
      Math.abs(c.lat - someNight.location!.lat) < 1e-6 && Math.abs(c.lng - someNight.location!.lng) < 1e-6,
    );
    expect(onCity, "la nuit-étape doit coïncider avec une ville connue").toBe(true);
  });

  it("ramène le foyer au point de départ le dernier jour", async () => {
    const cand = await layoutAligned(
      { anchor, selected: [dijon], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    const lastDay = cand.days[cand.days.length - 1];
    const lastLocated = [...lastDay.stops].reverse().find((s) => s.location)!;
    expect(Math.abs(lastLocated.location!.lat - FRESNES.lat)).toBeLessThan(0.05);
    expect(Math.abs(lastLocated.location!.lng - FRESNES.lng)).toBeLessThan(0.05);
  });

  it("découpe même un trajet direct sans aucune étape (origine→ancre lointaine)", async () => {
    // Aucune opportunité : Fresnes→Marseille (~5 h à 90 km/h) doit quand même
    // être réparti sous le plafond, avec arrivée avant l'événement.
    const cand = await layoutAligned(
      { anchor, selected: [], window, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    for (const d of cand.days) expect(d.driveMinutes).toBeLessThanOrEqual(CAP);
    const anchorDay = cand.days.find((d) => d.stops.some((s) => s.kind === "anchor"));
    expect(anchorDay?.date).toBe("2026-08-08");
    expect(cand.conflicts.some((c) => /Approche|Arrivée/.test(c))).toBe(false);
  });

  it("signale honnêtement une fenêtre trop serrée pour découper (jamais masqué)", async () => {
    // 1 nuit autour de l'ancre : impossible d'arriver reposé → conflit explicite,
    // pas un trajet de 5 h écrasé en silence.
    const tight: VacationWindow = {
      origin: FRESNES, earliestStart: "2026-08-08", latestEnd: "2026-08-09", minNights: 1, maxNights: 1,
    };
    const cand = await layoutAligned(
      { anchor, selected: [], window: tight, constraints, ambiance: "reposant", label: "T" },
      adapters,
    );
    // Soit l'approche est signalée non terminée / tardive, soit une journée
    // dépasse le plafond et est signalée — dans tous les cas, un conflit existe.
    const hasHonestConflict =
      cand.conflicts.some((c) => /Approche|Arrivée|fenêtre|route/i.test(c)) ||
      cand.days.some((d) => d.driveMinutes > CAP);
    expect(hasHonestConflict).toBe(true);
  });
});
