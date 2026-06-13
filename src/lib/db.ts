"use client";

import Dexie, { type EntityTable } from "dexie";
import type { TripPlan, FamilyProfile } from "@/types";
import {
  createDefaultProfile,
  safeParseProfile,
  updateProfile,
  type ProfilePatch,
} from "@/lib/profile/profile";
import type { Expense, ExpenseCategory } from "@/lib/budget/budget";

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

/** Véhicule sélectionné par l'utilisateur (singleton, id fixe). */
interface VehicleSelectionRow {
  id: string;
  vehicleId: string;
  displayName: string;
  selectedAt: string;
}

const VEHICLE_SELECTION_ID = "active";

interface ExpenseRow extends Expense {
  createdAt: string;
}

/** Réglages budget (singleton) : voyageurs + budgets cibles par poste. */
interface BudgetSettingsRow {
  id: string;
  travelers: string[];
  budgets: Partial<Record<ExpenseCategory, number>>;
}

const BUDGET_SETTINGS_ID = "active";

/** État de la liste de bagages (singleton) : config + articles cochés. */
interface PackingStateRow {
  id: string;
  durationDays: number;
  month: number;
  checkedKeys: string[];
}

const PACKING_STATE_ID = "active";

const DEFAULT_BUDGET_SETTINGS: Omit<BudgetSettingsRow, "id"> = {
  travelers: ["Parent 1", "Parent 2"],
  budgets: { lodging: 1500, charging: 150, food: 600, activities: 400, tolls: 120, misc: 200 },
};

export class OdysseeDatabase extends Dexie {
  tripPlans!: EntityTable<StoredTripPlan, "id">;
  profiles!: EntityTable<FamilyProfile, "id">;
  lodgingSelections!: EntityTable<LodgingSelection, "id">;
  vehicleSelections!: EntityTable<VehicleSelectionRow, "id">;
  expenses!: EntityTable<ExpenseRow, "id">;
  budgetSettings!: EntityTable<BudgetSettingsRow, "id">;
  packingState!: EntityTable<PackingStateRow, "id">;

  constructor() {
    super("odyssee-db");
    this.version(1).stores({
      tripPlans: "id, storedAt",
      profiles: "id",
      lodgingSelections: "id, tripPlanId, date",
    });
    // v2 : sélection du véhicule Tesla (M3). Dexie conserve les stores v1.
    this.version(2).stores({
      vehicleSelections: "id",
    });
    // v3 : budget & dépenses (M8).
    this.version(3).stores({
      expenses: "id, category, date",
      budgetSettings: "id",
    });
    // v4 : état de la liste de bagages (M8).
    this.version(4).stores({
      packingState: "id",
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

// ---------------------------------------------------------------------------
// Sélection du véhicule Tesla (M3)
// ---------------------------------------------------------------------------

export interface SelectedVehicle {
  vehicleId: string;
  displayName: string;
  selectedAt: string;
}

/** Persiste le véhicule choisi par l'utilisateur (un seul actif). */
export async function saveSelectedVehicle(
  vehicleId: string,
  displayName: string,
): Promise<void> {
  const db = getDb();
  await db.vehicleSelections.put({
    id: VEHICLE_SELECTION_ID,
    vehicleId,
    displayName,
    selectedAt: new Date().toISOString(),
  });
}

/** Renvoie le véhicule sélectionné, ou null si aucun. */
export async function getSelectedVehicle(): Promise<SelectedVehicle | null> {
  const db = getDb();
  const row = await db.vehicleSelections.get(VEHICLE_SELECTION_ID);
  return row
    ? { vehicleId: row.vehicleId, displayName: row.displayName, selectedAt: row.selectedAt }
    : null;
}

// ---------------------------------------------------------------------------
// Budget & dépenses (M8)
// ---------------------------------------------------------------------------

export interface BudgetSettings {
  travelers: string[];
  budgets: Partial<Record<ExpenseCategory, number>>;
}

/** Réglages budget (graine au premier accès). */
export async function loadBudgetSettings(): Promise<BudgetSettings> {
  const db = getDb();
  const row = await db.budgetSettings.get(BUDGET_SETTINGS_ID);
  if (row) return { travelers: row.travelers, budgets: row.budgets };
  await db.budgetSettings.put({ id: BUDGET_SETTINGS_ID, ...DEFAULT_BUDGET_SETTINGS });
  return { travelers: [...DEFAULT_BUDGET_SETTINGS.travelers], budgets: { ...DEFAULT_BUDGET_SETTINGS.budgets } };
}

export async function saveBudgetSettings(settings: BudgetSettings): Promise<void> {
  const db = getDb();
  await db.budgetSettings.put({ id: BUDGET_SETTINGS_ID, ...settings });
}

export async function listExpenses(): Promise<Expense[]> {
  const db = getDb();
  const rows = await db.expenses.orderBy("date").toArray();
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    label: row.label,
    amountEur: row.amountEur,
    date: row.date,
    paidBy: row.paidBy,
    splitAmong: row.splitAmong,
  }));
}

export async function addExpense(expense: Expense): Promise<void> {
  const db = getDb();
  await db.expenses.put({ ...expense, createdAt: new Date().toISOString() });
}

export async function deleteExpense(id: string): Promise<void> {
  const db = getDb();
  await db.expenses.delete(id);
}

// ---------------------------------------------------------------------------
// Liste de bagages (M8)
// ---------------------------------------------------------------------------

export interface PackingState {
  durationDays: number;
  month: number;
  checkedKeys: string[];
}

const DEFAULT_PACKING_STATE: PackingState = {
  durationDays: 15,
  month: 8,
  checkedKeys: [],
};

export async function loadPackingState(): Promise<PackingState> {
  const db = getDb();
  const row = await db.packingState.get(PACKING_STATE_ID);
  if (row) {
    return { durationDays: row.durationDays, month: row.month, checkedKeys: row.checkedKeys };
  }
  await db.packingState.put({ id: PACKING_STATE_ID, ...DEFAULT_PACKING_STATE });
  return { ...DEFAULT_PACKING_STATE, checkedKeys: [] };
}

export async function savePackingState(state: PackingState): Promise<void> {
  const db = getDb();
  await db.packingState.put({ id: PACKING_STATE_ID, ...state });
}
