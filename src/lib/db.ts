"use client";

import Dexie, { type EntityTable } from "dexie";
import type { TripPlan, FamilyProfile } from "@/types";

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
