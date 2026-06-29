/**
 * Construction **pure** des requêtes envoyées aux moteurs depuis un formState.
 *
 * Source unique de vérité partagée par :
 *  - les formulaires (`AnchoredTripForm` / `PlannedTripForm`) qui *envoient* la
 *    requête ;
 *  - le journal de debug (`debug-trace.ts`) qui *reconstruit* la requête à
 *    l'identique pour l'audit.
 *
 * Garder cette logique ici garantit que ce qu'on rejoue dans le journal est
 * exactement ce qui a été soumis (pas de dérive entre deux copies du code).
 */

import { geocodeCity } from "@/lib/routing/geocode";
import { summarizeProfile } from "@/lib/profile/profile";
import type { FamilyProfile } from "@/types";
import type {
  Anchor,
  HouseholdConstraints,
  Opportunity,
  SynthesisRequest,
} from "@/lib/synthesis/types";
import type {
  AnchoredFormState,
  PlannedFormState,
  PlanStop,
} from "./types";
import { nightsFromIntent } from "./types";

const WEEKDAY_TO_NUM: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function hhmm(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function constraintsFromProfile(p: FamilyProfile): HouseholdConstraints {
  return {
    babyPauseEveryMin: p.baby.maxLegMinutes,
    babyPauseDurationMin: 15,
    // Plafond de conduite **par jour**, dérivé du Profil Foyer (au lieu d'un 300
    // codé en dur). Au plus ~deux segments de conduite confortables (le segment
    // max du profil) dans une journée — un trajet plus long est découpé par le
    // solveur avec une nuit intermédiaire. Plancher de sécurité à 180 min.
    maxDrivePerDayMin: Math.max(180, Math.round(p.driving.maxSegmentMinutes * 2)),
    workDays: p.work.workDays
      .map((d) => WEEKDAY_TO_NUM[d])
      .filter((n): n is number => typeof n === "number"),
    workStart: hhmm(p.work.workStartHour),
    workEnd: hhmm(p.work.workEndHour),
    caniculeNoDrive: {
      start: hhmm(p.driving.noHeatDrivingRange[0]),
      end: hhmm(p.driving.noHeatDrivingRange[1]),
    },
  };
}

export function stopToOpportunity(stop: PlanStop, index: number): Opportunity | null {
  const geo = geocodeCity(stop.city);
  if (!geo) return null;
  const nights = Math.max(0, stop.nights);
  // Une étape saisie est **garantie** (forced) : durée de visite sur place
  // bornée (demi-journée) — les nuits sont modélisées par `stayNights`, pas
  // par une visite de 10h qui déborderait la journée et fausserait le budget.
  return {
    id: `user-stop-${index}-${slug(stop.city)}`,
    title: `${stop.city} (étape${nights > 0 ? ` · ${nights} nuit${nights > 1 ? "s" : ""}` : ""})`,
    category: "attraction",
    location: { lat: geo.lat, lng: geo.lng },
    score: 1,
    durationMin: 180,
    timeWindow: stop.fixedDate
      ? { start: stop.fixedDate, end: stop.fixedDate }
      : undefined,
    indoor: false,
    babyFriendly: true,
    source: "saisie utilisateur",
    sourceStatus: "verified",
    forced: true,
    stayNights: nights,
  };
}

export interface SynthesisBuildResult {
  request: SynthesisRequest | null;
  /** Bornes de nuits dérivées de l'intention (présentes même si request null). */
  derivedNights: { minNights: number; maxNights: number } | null;
  /** Date de fin d'ancre effective (égale au début pour un événement ponctuel). */
  effectiveAnchorEnd: string;
  /** Villes d'étape non géocodables (ignorées du solveur, signalées). */
  unknownStops: string[];
  /** Message d'erreur bloquant (ex. ville d'ancre inconnue). */
  error: string | null;
}

/**
 * Construit le `SynthesisRequest` (Mode B) à partir du formState et du profil.
 * Déterministe : aucune coordonnée n'est inventée — une ville inconnue de la
 * table seed provoque soit une erreur (ancre/départ), soit l'omission de
 * l'étape (signalée dans `unknownStops`).
 */
export function buildSynthesisRequest(
  form: AnchoredFormState,
  profile: FamilyProfile,
): SynthesisBuildResult {
  const effectiveAnchorEnd =
    form.anchorEndDate && form.anchorEndDate.length === 10
      ? form.anchorEndDate
      : form.anchorStartDate;

  const derivedNights = nightsFromIntent({
    intent: form.intent,
    earliestStart: form.earliestStart,
    latestEnd: form.latestEnd,
    anchorStartDate: form.anchorStartDate,
    anchorEndDate: effectiveAnchorEnd,
    minNights: form.minNights,
    maxNights: form.maxNights,
  });

  const anchorGeo = geocodeCity(form.anchorCity);
  if (!anchorGeo) {
    return {
      request: null,
      derivedNights,
      effectiveAnchorEnd,
      unknownStops: [],
      error: `Ville inconnue pour l'ancre : ${form.anchorCity}`,
    };
  }
  const originGeo = geocodeCity(form.originCity);
  if (!originGeo) {
    return {
      request: null,
      derivedNights,
      effectiveAnchorEnd,
      unknownStops: [],
      error: `Ville inconnue pour le départ : ${form.originCity}`,
    };
  }

  const anchor: Anchor = {
    id: `user-anchor-${slug(form.anchorTitle)}`,
    kind: "event",
    title: form.anchorTitle.trim(),
    location: { lat: anchorGeo.lat, lng: anchorGeo.lng },
    start: `${form.anchorStartDate}T${form.anchorStartTime}:00`,
    end: `${effectiveAnchorEnd}T${form.anchorEndTime}:00`,
    source: "saisie utilisateur",
    sourceStatus: "verified",
  };

  const opportunities: Opportunity[] = form.stops
    .map((s, i) => stopToOpportunity(s, i))
    .filter((o): o is Opportunity => o !== null);
  const unknownStops = form.stops
    .filter((s) => s.city.trim().length > 0)
    .filter((s) => !geocodeCity(s.city))
    .map((s) => s.city);

  const request: SynthesisRequest = {
    anchors: [anchor],
    opportunities,
    people: [],
    window: {
      origin: { lat: originGeo.lat, lng: originGeo.lng },
      earliestStart: form.earliestStart,
      latestEnd: form.latestEnd,
      minNights: derivedNights.minNights,
      maxNights: derivedNights.maxNights,
    },
    constraints: constraintsFromProfile(profile),
  };

  return { request, derivedNights, effectiveAnchorEnd, unknownStops, error: null };
}

// ── Mode A : corps de requête /api/agents/itinerary ─────────────────────────

export interface ItineraryRequestBody {
  description: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  constraints: string[];
  workDays: string[];
}

function formatStopsForPrompt(stops: PlanStop[]): string {
  if (stops.length === 0) return "";
  const lines = stops
    .filter((s) => s.city.trim().length > 0)
    .map((s) => {
      const nights = s.nights > 0 ? `${s.nights} nuit${s.nights > 1 ? "s" : ""}` : "passage";
      const fixed = s.fixedDate ? ` (fixé au ${s.fixedDate})` : "";
      return `• ${s.city.trim()} — ${nights}${fixed}`;
    });
  if (lines.length === 0) return "";
  return `\n\nÉtapes à respecter :\n${lines.join("\n")}`;
}

/** Construit le corps envoyé à `/api/agents/itinerary` (Mode A). */
export function buildItineraryRequestBody(
  form: PlannedFormState,
  profile: FamilyProfile,
): ItineraryRequestBody {
  const constraints = summarizeProfile(profile).map(
    (l) => `${l.label} : ${l.value} — ${l.note}`,
  );
  const prefix = `Voyage de ${form.origin.trim()} à ${form.destination.trim()}, du ${form.dateFrom} au ${form.dateTo}.`;
  const desiresClean = form.desires.trim();
  const description =
    prefix +
    formatStopsForPrompt(form.stops) +
    (desiresClean ? `\n\nEnvies : ${desiresClean}` : "");
  return {
    description,
    destination: form.destination.trim(),
    dateFrom: form.dateFrom,
    dateTo: form.dateTo,
    constraints,
    workDays: profile.work.workDays,
  };
}
