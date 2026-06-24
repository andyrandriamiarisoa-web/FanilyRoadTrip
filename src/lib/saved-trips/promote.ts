/**
 * Promotion d'un voyage sauvegardé vers le **carnet de route** (`TripPlan`).
 *
 * Le moteur historique (`mock-orchestrator`) prend un `TripRequest` qui décrit
 * un voyage (origine + destination + dates + événements à dates fixes). On
 * convertit ici les deux formStates de `/plan` vers cette structure, sans
 * inventer de données : si le géocodage local échoue pour une ville, la
 * conversion remonte une erreur claire (jamais de coordonnées par défaut).
 *
 * Anti-pattern #3 respecté : aucune coordonnée n'est fabriquée.
 */

import { geocodeCity } from "@/lib/routing/geocode";
import type { TripRequest, FixedEvent } from "@/types";
import type {
  AnchoredFormState,
  FormState,
  PlannedFormState,
} from "./types";

/** Renvoie un nombre entier non-négatif de jours entre deux dates ISO. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Convertit "HH:mm" en heures décimales (8.5 = 8h30). */
function timeToHourDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number(s));
  return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m / 60 : 0);
}

// ---------------------------------------------------------------------------
// Mode A — voyage planifié
// ---------------------------------------------------------------------------

export function plannedFormToTripRequest(
  form: PlannedFormState,
  opts: { profileId?: string } = {},
): TripRequest {
  const originGeo = geocodeCity(form.origin);
  if (!originGeo) throw new Error(`Ville inconnue (départ) : ${form.origin}`);
  const destGeo = geocodeCity(form.destination);
  if (!destGeo) throw new Error(`Ville inconnue (destination) : ${form.destination}`);

  // Étapes utilisateur avec date fixée → fixedEvents (à l'orchestrator de les
  // honorer ; sinon il les ignorera proprement).
  const fixedEvents: FixedEvent[] = form.stops
    .filter((s) => s.fixedDate && s.city.trim().length > 0)
    .map((s, i): FixedEvent | null => {
      const geo = geocodeCity(s.city);
      if (!geo) return null;
      return {
        id: `user-stop-${i}`,
        name: `Étape ${s.city}`,
        date: s.fixedDate!,
        hour: 12,
        location: {
          address: s.city,
          lat: geo.lat,
          lng: geo.lng,
        },
        maxDistanceKm: 10,
        requiresNightBefore: false,
      };
    })
    .filter((e): e is FixedEvent => e !== null);

  return {
    origin: form.origin,
    originLat: originGeo.lat,
    originLng: originGeo.lng,
    destination: form.destination,
    destinationLat: destGeo.lat,
    destinationLng: destGeo.lng,
    departureFrom: form.dateFrom,
    departureTo: form.dateFrom,
    maxDays: daysBetween(form.dateFrom, form.dateTo),
    fixedEvents,
    profileId: opts.profileId,
  };
}

// ---------------------------------------------------------------------------
// Mode B — voyage avec ancre
// ---------------------------------------------------------------------------

/**
 * Pour le mode B, l'ancre devient `fixedEvents[0]`. Origine = domicile.
 * Destination = ville de l'ancre. Fenêtre = `earliestStart..latestEnd`,
 * borné par `maxNights + 1` jours.
 *
 * On laisse l'orchestrator choisir la date de départ effective dans la
 * fenêtre. L'ancre est `requiresNightBefore: true` (besoin d'arriver la
 * veille pour un événement avec heure de début).
 */
export function anchoredFormToTripRequest(
  form: AnchoredFormState,
  opts: { profileId?: string } = {},
): TripRequest {
  const originGeo = geocodeCity(form.originCity);
  if (!originGeo) throw new Error(`Ville inconnue (départ) : ${form.originCity}`);
  const anchorGeo = geocodeCity(form.anchorCity);
  if (!anchorGeo) throw new Error(`Ville inconnue (ancre) : ${form.anchorCity}`);

  const anchorEvent: FixedEvent = {
    id: `user-anchor`,
    name: form.anchorTitle,
    date: form.anchorStartDate,
    hour: timeToHourDecimal(form.anchorStartTime),
    location: {
      address: form.anchorCity,
      lat: anchorGeo.lat,
      lng: anchorGeo.lng,
    },
    maxDistanceKm: 10,
    requiresNightBefore: true,
  };

  // Étapes utilisateur avec date fixée → fixedEvents additionnels.
  const stopEvents: FixedEvent[] = form.stops
    .filter((s) => s.fixedDate && s.city.trim().length > 0)
    .map((s, i): FixedEvent | null => {
      const geo = geocodeCity(s.city);
      if (!geo) return null;
      return {
        id: `user-stop-${i}`,
        name: `Étape ${s.city}`,
        date: s.fixedDate!,
        hour: 12,
        location: {
          address: s.city,
          lat: geo.lat,
          lng: geo.lng,
        },
        maxDistanceKm: 10,
        requiresNightBefore: false,
      };
    })
    .filter((e): e is FixedEvent => e !== null);

  return {
    origin: form.originCity,
    originLat: originGeo.lat,
    originLng: originGeo.lng,
    destination: form.anchorCity,
    destinationLat: anchorGeo.lat,
    destinationLng: anchorGeo.lng,
    departureFrom: form.earliestStart,
    departureTo: form.earliestStart,
    maxDays: Math.max(form.minNights + 1, form.maxNights + 1),
    fixedEvents: [anchorEvent, ...stopEvents],
    profileId: opts.profileId,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher unique
// ---------------------------------------------------------------------------

export function formStateToTripRequest(
  form: FormState,
  opts: { profileId?: string } = {},
): TripRequest {
  return form.mode === "planned"
    ? plannedFormToTripRequest(form, opts)
    : anchoredFormToTripRequest(form, opts);
}
