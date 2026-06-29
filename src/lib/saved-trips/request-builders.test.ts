/**
 * Tests des builders de requête (source unique partagée formulaires ↔ journal
 * de debug). On couvre la validation (cas nominaux) et les échecs (villes
 * inconnues, étape non géocodable) — anti-pattern : jamais inventer de coord.
 */

import { describe, it, expect } from "vitest";
import {
  constraintsFromProfile,
  stopToOpportunity,
  buildSynthesisRequest,
} from "./request-builders";
import { DEFAULT_FAMILY_PROFILE } from "@/data/default-profile";
import type { FamilyProfile } from "@/types";
import type { AnchoredFormState } from "./types";

describe("constraintsFromProfile", () => {
  it("dérive le plafond de conduite/jour du profil (pas de 300 codé en dur)", () => {
    const c = constraintsFromProfile(DEFAULT_FAMILY_PROFILE);
    // maxSegmentMinutes 140 → 2 segments confort = 280 min/jour.
    expect(c.maxDrivePerDayMin).toBe(280);
    // Pauses bébé alignées sur le profil.
    expect(c.babyPauseEveryMin).toBe(DEFAULT_FAMILY_PROFILE.baby.maxLegMinutes);
    // Jours travaillés convertis en 1=lun..7=dim.
    expect(c.workDays).toEqual([1, 2, 3, 4]);
    expect(c.workStart).toBe("08:30");
    expect(c.workEnd).toBe("19:00");
    expect(c.caniculeNoDrive).toEqual({ start: "12:00", end: "16:00" });
  });

  it("applique un plancher de sécurité de 180 min pour un profil très prudent", () => {
    const prudent: FamilyProfile = {
      ...DEFAULT_FAMILY_PROFILE,
      driving: { ...DEFAULT_FAMILY_PROFILE.driving, maxSegmentMinutes: 60 },
    };
    // 60 * 2 = 120 < 180 → plancher.
    expect(constraintsFromProfile(prudent).maxDrivePerDayMin).toBe(180);
  });

  it("augmente le plafond pour un conducteur endurant", () => {
    const endurant: FamilyProfile = {
      ...DEFAULT_FAMILY_PROFILE,
      driving: { ...DEFAULT_FAMILY_PROFILE.driving, maxSegmentMinutes: 200 },
    };
    expect(constraintsFromProfile(endurant).maxDrivePerDayMin).toBe(400);
  });
});

describe("stopToOpportunity", () => {
  it("transforme une étape connue en opportunité garantie (forced)", () => {
    const opp = stopToOpportunity({ city: "Dijon", nights: 2, fixedDate: null }, 0);
    expect(opp).not.toBeNull();
    expect(opp!.forced).toBe(true);
    expect(opp!.stayNights).toBe(2);
    expect(opp!.id).toBe("user-stop-0-dijon");
    expect(opp!.title).toContain("Dijon");
    expect(opp!.title).toContain("2 nuits");
    expect(opp!.sourceStatus).toBe("verified");
  });

  it("retourne null pour une ville inconnue (jamais de coordonnée inventée)", () => {
    expect(stopToOpportunity({ city: "Villeinconnuexyz", nights: 1, fixedDate: null }, 0)).toBeNull();
  });

  it("propage une date fixée en timeWindow", () => {
    const opp = stopToOpportunity({ city: "Lyon", nights: 1, fixedDate: "2026-08-03" }, 1);
    expect(opp!.timeWindow).toEqual({ start: "2026-08-03", end: "2026-08-03" });
  });
});

describe("buildSynthesisRequest", () => {
  const baseForm: AnchoredFormState = {
    mode: "anchored",
    anchorTitle: "Anniversaire mariage",
    anchorCity: "Marseille",
    anchorStartDate: "2026-08-08",
    anchorEndDate: "2026-08-09",
    anchorStartTime: "10:00",
    anchorEndTime: "14:30",
    originCity: "Fresnes",
    earliestStart: "2026-07-31",
    latestEnd: "2026-08-16",
    intent: "custom",
    minNights: 15,
    maxNights: 16,
    stops: [{ city: "Dijon", nights: 2, fixedDate: null }],
  };

  it("construit une requête valide et injecte le plafond profil", () => {
    const res = buildSynthesisRequest(baseForm, DEFAULT_FAMILY_PROFILE);
    expect(res.error).toBeNull();
    expect(res.request).not.toBeNull();
    expect(res.request!.constraints.maxDrivePerDayMin).toBe(280);
    expect(res.request!.opportunities).toHaveLength(1);
    expect(res.request!.opportunities[0].forced).toBe(true);
    expect(res.unknownStops).toEqual([]);
  });

  it("bloque honnêtement sur une ville d'ancre inconnue", () => {
    const res = buildSynthesisRequest({ ...baseForm, anchorCity: "Citytatouine" }, DEFAULT_FAMILY_PROFILE);
    expect(res.request).toBeNull();
    expect(res.error).toMatch(/ancre/i);
  });

  it("signale une étape non géocodable sans l'inventer", () => {
    const res = buildSynthesisRequest(
      { ...baseForm, stops: [{ city: "Dijon", nights: 2, fixedDate: null }, { city: "Zorglubville", nights: 1, fixedDate: null }] },
      DEFAULT_FAMILY_PROFILE,
    );
    expect(res.request).not.toBeNull();
    expect(res.request!.opportunities).toHaveLength(1); // seule Dijon géocodée
    expect(res.unknownStops).toContain("Zorglubville");
  });
});
