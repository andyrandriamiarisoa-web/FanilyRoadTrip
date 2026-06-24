/**
 * Construction d'un `TripPlan` (le format historique du carnet) à partir
 * d'un voyage **réellement composé** par l'utilisateur :
 *
 *  - Mode B : on part du `TripCandidate` choisi (sortie du solveur S1–S7).
 *  - Mode A : on part de l'`AiItineraryDraft` (sortie de Claude / mock).
 *
 * Important : aucune donnée n'est inventée. Si une coordonnée n'est pas
 * disponible (géocodage seed inconnu pour une ville saisie), le jour
 * concerné reçoit un `lodging` sans `lat`/`lng` (l'UI signalera honnêtement
 * l'impossibilité de rafraîchir les dispos pour cette nuit).
 *
 * Cette fonction remplace l'ancien `runMockOrchestrator` côté promotion :
 * désormais le carnet reflète **vraiment** le voyage composé, et la
 * recherche de logement (refresh dispos) itère sur les vraies nuits.
 */

import type {
  TripPlan,
  DayPlan,
  LodgingOption,
  TripRequest,
} from "@/types";
import type { TripCandidate, PlannedDay } from "@/lib/synthesis/types";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import { geocodeCity } from "@/lib/routing/geocode";
import { FRENCH_CITIES } from "@/data/cities";
import type {
  AnchoredFormState,
  PlannedFormState,
} from "./types";
import {
  formStateToTripRequest,
} from "./promote";

interface BuildOpts {
  profileId: string;
}

// ── Lodging minimal (sans inventer de prix) ─────────────────────────────────

function minimalLodging(opts: {
  city: string;
  lat: number;
  lng: number;
  nights: number;
}): LodgingOption {
  return {
    id: `placeholder-${slugify(opts.city)}`,
    name: `Hébergement à ${opts.city} (à rechercher)`,
    address: opts.city,
    lat: opts.lat,
    lng: opts.lng,
    priceTotal: 0,
    nights: opts.nights,
    amenities: {
      ac: false,
      parking: false,
      evCharger: false,
      desk: false,
    },
    toConfirm: ["firmMattress", "desk32", "lateCheckout", "babyBed"],
    sourceStatus: "estimated",
    tier: "best",
  };
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Mode B : TripCandidate → TripPlan ───────────────────────────────────────

/**
 * Détermine la ville et les coordonnées d'un jour planifié à partir de ses
 * stops. On prend le dernier stop avec une location (en général la `night`
 * ou le dernier `drive`/`anchor`) — c'est l'endroit où le foyer dort.
 */
function dayLocation(day: PlannedDay): { city: string; lat?: number; lng?: number } {
  // Priorité : night > anchor > visit > drive (du plus stable au plus volatil).
  const priorities = ["night", "anchor", "visit", "drive"] as const;
  for (const kind of priorities) {
    const stop = [...day.stops].reverse().find((s) => s.kind === kind && s.location);
    if (stop && stop.location) {
      return {
        city: stop.title.replace(/^Trajet vers /, ""),
        lat: stop.location.lat,
        lng: stop.location.lng,
      };
    }
  }
  return { city: "Étape" };
}

/** Détermine le type de jour à partir des stops. */
function dayType(day: PlannedDay): DayPlan["type"] {
  const hasAnchor = day.stops.some((s) => s.kind === "anchor");
  if (hasAnchor) return "event";
  if (day.isWorkday) return "work";
  const drove = day.stops.some((s) => s.kind === "drive");
  if (drove) return "drive";
  return "rest";
}

export function candidateToTripPlan(
  candidate: TripCandidate,
  form: AnchoredFormState,
  opts: BuildOpts,
): TripPlan {
  // Reconstruit un TripRequest cohérent (sert d'audit et de support à l'export).
  const tripRequest = formStateToTripRequest(form, { profileId: opts.profileId });

  const days: DayPlan[] = candidate.days.map((day) => {
    const loc = dayLocation(day);
    const notes: string[] = [];
    // Notes utiles : conflits du jour, événements, observations workation.
    for (const s of day.stops) {
      if (s.kind === "anchor" && s.note) notes.push(s.note);
      if (s.kind === "canicule-block") notes.push(s.title);
    }
    return {
      date: day.date,
      type: dayType(day),
      location: loc.city,
      lodging:
        loc.lat !== undefined && loc.lng !== undefined
          ? minimalLodging({ city: loc.city, lat: loc.lat, lng: loc.lng, nights: 1 })
          : undefined,
      workStatus: day.isWorkday ? "full" : "none",
      notes,
      heatAdvisory: candidate.caniculeExposureDays > 0,
    };
  });

  return {
    id: `composed-${slugify(candidate.label)}-${Date.now()}`,
    version: 1,
    createdAt: new Date().toISOString(),
    profileId: opts.profileId,
    tripRequest: stripTripRequest(tripRequest),
    days,
    totalDistanceKm: estimateDistanceKm(candidate),
    totalDrivingMinutes: candidate.totalDriveMinutes,
    lodgingSelections: {},
    budgetEstimate: { lodgingTotal: 0, chargingTotal: 0 },
    feasible: candidate.conflicts.length === 0,
    conflicts: candidate.conflicts,
    agentLog: [
      {
        agent: "candidate-to-trip-plan",
        input: { candidateLabel: candidate.label, anchorTitle: form.anchorTitle },
        output: { daysGenerated: days.length, conflicts: candidate.conflicts.length },
        durationMs: 0,
      },
    ],
  };
}

/** Estimation grossière de la distance à partir de l'enchaînement des stops. */
function estimateDistanceKm(candidate: TripCandidate): number {
  // On ne tient pas à inventer un km exact : la durée de conduite × ~80km/h
  // donne un ordre de grandeur honnête. Tag « estimated » par construction.
  return Math.round((candidate.totalDriveMinutes / 60) * 80);
}

function stripTripRequest(r: TripRequest): TripPlan["tripRequest"] {
  return {
    origin: r.origin,
    originLat: r.originLat,
    originLng: r.originLng,
    destination: r.destination,
    destinationLat: r.destinationLat,
    destinationLng: r.destinationLng,
    departureFrom: r.departureFrom,
    departureTo: r.departureTo,
    maxDays: r.maxDays,
    fixedEvents: r.fixedEvents,
  };
}

// ── Mode A : AiItineraryDraft → TripPlan ────────────────────────────────────

/**
 * Convertit un brouillon IA (Mode A) en `TripPlan`. Le brouillon contient un
 * `lodgingHint` textuel par jour ; on en extrait la ville (le 1er nom de
 * ville reconnu dans `FRENCH_CITIES`) pour géocoder. Si rien n'est reconnu,
 * on tombe sur la destination du formulaire.
 */
export function draftToTripPlan(
  draft: AiItineraryDraft,
  form: PlannedFormState,
  opts: BuildOpts,
): TripPlan {
  const tripRequest = formStateToTripRequest(form, { profileId: opts.profileId });

  const days: DayPlan[] = draft.days.map((day) => {
    const city = extractCityFromHint(day.lodgingHint, form);
    const geo = city ? geocodeCity(city) : null;
    return {
      date: day.date,
      type: classifyDay(day),
      location: city ?? form.destination,
      lodging: geo
        ? minimalLodging({ city: city!, lat: geo.lat, lng: geo.lng, nights: 1 })
        : undefined,
      workStatus: isWorkday(day.date) ? "full" : "none",
      notes: day.constraintNotes,
      heatAdvisory: day.constraintNotes.some((n) =>
        /canicule|chaleur/i.test(n),
      ),
    };
  });

  const totalDrivingMinutes = draft.days.reduce(
    (sum, d) => sum + (d.leg?.drivingMinutes ?? 0),
    0,
  );
  const totalDistanceKm = draft.days.reduce(
    (sum, d) => sum + (d.leg?.distanceKm ?? 0),
    0,
  );

  return {
    id: `draft-${slugify(form.destination)}-${Date.now()}`,
    version: 1,
    createdAt: new Date().toISOString(),
    profileId: opts.profileId,
    tripRequest: stripTripRequest(tripRequest),
    days,
    totalDistanceKm: Math.round(totalDistanceKm),
    totalDrivingMinutes: Math.round(totalDrivingMinutes),
    lodgingSelections: {},
    budgetEstimate: { lodgingTotal: 0, chargingTotal: 0 },
    feasible: true,
    conflicts: [],
    agentLog: [
      {
        agent: "draft-to-trip-plan",
        input: {
          destination: form.destination,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
        },
        output: { daysGenerated: days.length },
        durationMs: 0,
      },
    ],
  };
}

/**
 * Extrait un nom de ville du `lodgingHint` libre fourni par le LLM.
 * Cherche d'abord les villes saisies par l'utilisateur (étapes, dest, origine),
 * puis n'importe quelle ville connue dans `FRENCH_CITIES` apparaissant dans le
 * hint. Retombe sur la destination du formulaire si rien ne matche.
 */
function extractCityFromHint(hint: string, form: PlannedFormState): string | null {
  const lower = hint.toLowerCase();
  // Préférence : citer une étape user saisie qui apparaît dans le hint.
  for (const stop of form.stops) {
    if (stop.city && lower.includes(stop.city.toLowerCase())) return stop.city;
  }
  if (form.destination && lower.includes(form.destination.toLowerCase())) {
    return form.destination;
  }
  if (form.origin && lower.includes(form.origin.toLowerCase())) {
    return form.origin;
  }
  // Repli : balaye les villes connues, prend la première match.
  for (const c of FRENCH_CITIES) {
    if (lower.includes(c.name.toLowerCase())) return c.name;
  }
  // Dernier repli : tente géocodage direct du hint (cas où le hint = "Lyon").
  if (geocodeCity(hint)) return hint;
  return form.destination || form.origin || null;
}

function isWorkday(dateIso: string): boolean {
  // Le brouillon IA ne porte pas l'info ; on utilise la convention Lun–Jeu
  // (alignée sur le profil par défaut). Le carnet réactualisera si besoin.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const d = new Date(`${dateIso}T00:00:00Z`);
  const wd = d.getUTCDay(); // 0=dim … 6=sam
  return wd >= 1 && wd <= 4; // lun-jeu
}

function classifyDay(
  day: AiItineraryDraft["days"][number],
): DayPlan["type"] {
  if (day.drivingFromTo) return "drive";
  if (isWorkday(day.date)) return "work";
  return "rest";
}
