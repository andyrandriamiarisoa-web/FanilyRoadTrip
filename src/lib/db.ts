"use client";

import Dexie, { type EntityTable } from "dexie";
import type { TripPlan, FamilyProfile } from "@/types";
import {
  createDefaultProfile,
  safeParseProfile,
  updateProfile,
  type ProfilePatch,
} from "@/lib/profile/profile";

/** Identifiant du profil foyer actif (un seul foyer pour l'instant). */
export const ACTIVE_PROFILE_ID = "famille-default";

interface StoredTripPlan extends TripPlan {
  storedAt: string;
}

interface LodgingSelection {
  id: string;
  tripPlanId: string;
  date: string;
  lodgingId: string;
  selectedAt: string;
}

export class OdysseeDatabase extends Dexie {
  tripPlans!: EntityTable<StoredTripPlan, "id">;
  profiles!: EntityTable<FamilyProfile, "id">;
  lodgingSelections!: EntityTable<LodgingSelection, "id">;

  constructor() {
    super("odyssee-db");
    this.version(1).stores({
      tripPlans: "id, storedAt",
      profiles: "id",
      lodgingSelections: "id, tripPlanId, date",
    });
  }
}

let _db: OdysseeDatabase | null = null;

export function getDb(): OdysseeDatabase {
  if (!_db) {
    _db = new OdysseeDatabase();
  }
  return _db;
}

export async function saveTrip(plan: TripPlan): Promise<void> {
  const db = getDb();
  await db.tripPlans.put({ ...plan, storedAt: new Date().toISOString() });
}

export async function getLatestTrip(): Promise<TripPlan | null> {
  const db = getDb();
  const all = await db.tripPlans.orderBy("storedAt").reverse().limit(1).toArray();
  return all[0] ?? null;
}

export async function getTrip(id: string): Promise<TripPlan | null> {
  const db = getDb();
  const trip = await db.tripPlans.get(id);
  return trip ?? null;
}

export async function saveLodgingSelection(
  tripPlanId: string,
  date: string,
  lodgingId: string
): Promise<void> {
  const db = getDb();
  await db.lodgingSelections.put({
    id: `${tripPlanId}-${date}`,
    tripPlanId,
    date,
    lodgingId,
    selectedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Profil Foyer — chargement, graine au premier lancement, sauvegarde versionnée
// ---------------------------------------------------------------------------

/**
 * Charge le profil foyer actif. Au premier lancement (table vide), la graine
 * de référence est persistée puis renvoyée. Si la valeur stockée est corrompue
 * ou issue d'un ancien schéma, on retombe proprement sur la graine.
 */
export async function loadActiveProfile(): Promise<FamilyProfile> {
  const db = getDb();
  const stored = await db.profiles.get(ACTIVE_PROFILE_ID);
  const valid = stored ? safeParseProfile(stored) : null;
  if (valid) return valid;

  const seeded = createDefaultProfile();
  await db.profiles.put(seeded);
  return seeded;
}

/**
 * Applique un patch au profil actif, incrémente la version, horodate et
 * persiste. Renvoie le profil enregistré.
 */
export async function saveProfilePatch(patch: ProfilePatch): Promise<FamilyProfile> {
  const db = getDb();
  const current = await loadActiveProfile();
  const next = updateProfile(current, patch);
  await db.profiles.put(next);
  return next;
}

export async function getLodgingSelections(
  tripPlanId: string
): Promise<Record<string, string>> {
  const db = getDb();
  const selections = await db.lodgingSelections
    .where("tripPlanId")
    .equals(tripPlanId)
    .toArray();
  return Object.fromEntries(selections.map((s) => [s.date, s.lodgingId]));
}
