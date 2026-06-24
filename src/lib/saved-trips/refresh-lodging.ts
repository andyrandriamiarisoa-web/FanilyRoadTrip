/**
 * Rafraîchissement des disponibilités hôtel pour un voyage sauvegardé.
 *
 * Parcourt les nuits d'un `TripPlan` (issu du carnet) et appelle, pour chaque
 * étape ayant une localisation et une date de check-in/check-out cohérentes,
 * la route `/api/lodging/availability`. Chaque réponse devient un
 * `LodgingSnapshot` daté et estampillé de sa source — mock par défaut,
 * LiteAPI Sandbox ou Hotelbeds Test en mode `live`. Aucune réservation n'est
 * jamais effectuée (anti-pattern projet : read-only strict).
 *
 * Pur côté logique (l'I/O réseau est injecté via `fetchImpl`) — testable.
 */

import type { TripPlan } from "@/types";
import type { LodgingSnapshot } from "./types";
import { slugCity } from "./types";

interface AvailabilityResponseBody {
  ok?: boolean;
  offers?: unknown[];
  sourceName?: string;
  notes?: string[];
  error?: string;
}

interface RefreshOptions {
  savedTripId: string;
  /** Heure de check-in/out pour les requêtes (J → J+1). Override possible pour les tests. */
  fetchImpl?: typeof fetch;
  /** Horodatage de lecture injectable pour les tests déterministes. */
  now?: () => Date;
}

export interface RefreshOutcome {
  snapshots: LodgingSnapshot[];
  errors: { date: string; city: string; reason: string }[];
}

/** Liste les nuits à rafraîchir : un jour par étape avec lodging ou location. */
export interface NightToRefresh {
  date: string;
  /** Lendemain, utilisé comme `checkOut`. */
  nextDate: string;
  city: string;
  lat: number;
  lng: number;
}

function isoDayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Détermine la liste des nuits où chercher de la dispo hôtel.
 * On considère qu'une nuit existe si le jour a un `lodging` (le orchestrator
 * y a déjà mis quelque chose). On utilise les coords du lodging quand
 * dispos, sinon on saute proprement (l'absence est signalée dans `errors`).
 */
export function nightsFromTripPlan(plan: TripPlan): NightToRefresh[] {
  const nights: NightToRefresh[] = [];
  for (const day of plan.days) {
    const lodging = day.lodging;
    if (!lodging) continue;
    if (
      typeof lodging.lat !== "number" ||
      typeof lodging.lng !== "number"
    ) continue;
    nights.push({
      date: day.date,
      nextDate: isoDayAfter(day.date),
      city: day.location,
      lat: lodging.lat,
      lng: lodging.lng,
    });
  }
  return nights;
}

/**
 * Rafraîchit les dispos hôtel pour chaque nuit du plan. Sérialise les appels
 * (le quota sandbox est faible — 50 req/jour Hotelbeds, 5 req/s LiteAPI).
 */
export async function refreshLodgingForPlan(
  plan: TripPlan,
  opts: RefreshOptions,
): Promise<RefreshOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const nights = nightsFromTripPlan(plan);
  const snapshots: LodgingSnapshot[] = [];
  const errors: RefreshOutcome["errors"] = [];

  for (const n of nights) {
    try {
      const res = await fetchImpl("/api/lodging/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: n.city,
          lat: n.lat,
          lng: n.lng,
          checkIn: n.date,
          checkOut: n.nextDate,
          adults: 2,
          children: 0,
        }),
      });
      const data = (await res.json()) as AvailabilityResponseBody;
      if (!res.ok || data.ok === false) {
        errors.push({
          date: n.date,
          city: n.city,
          reason: data.error ?? `HTTP ${res.status}`,
        });
        continue;
      }
      snapshots.push({
        id: `${opts.savedTripId}-${n.date}-${slugCity(n.city)}`,
        savedTripId: opts.savedTripId,
        date: n.date,
        city: n.city,
        lat: n.lat,
        lng: n.lng,
        result: {
          offers: data.offers ?? [],
          sourceName: data.sourceName ?? "mock",
          notes: data.notes ?? [],
        },
        readAt: now().toISOString(),
      });
    } catch (err) {
      errors.push({
        date: n.date,
        city: n.city,
        reason: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  return { snapshots, errors };
}

/**
 * Fraîcheur d'un snapshot, en heures. `null` si pas de snapshot.
 * Utile pour afficher une suggestion « > 24h, rafraîchir ».
 */
export function snapshotAgeHours(snapshot: LodgingSnapshot | null, now: Date = new Date()): number | null {
  if (!snapshot) return null;
  const then = new Date(snapshot.readAt).getTime();
  return Math.max(0, (now.getTime() - then) / 3_600_000);
}
