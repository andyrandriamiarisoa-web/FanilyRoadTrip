/**
 * Voyages sauvegardés (Lot V1) — types et schémas Zod.
 *
 * Un `SavedTrip` encapsule la **saisie** (formState) et le **résultat calculé**
 * d'un voyage. Il peut être :
 *  - `draft` : en cours d'élaboration (saisie partielle ou complète, résultat
 *    optionnel) ;
 *  - `validated` : promu au carnet de route — un `TripPlan` historique a été
 *    généré et écrit dans le store `tripPlans` (id dans `promotedTripPlanId`) ;
 *  - `archived` : conservé pour mémoire, retiré de la liste « actifs ».
 *
 * Les snapshots de disponibilité hôtel vivent dans un store séparé
 * (`lodgingSnapshots`), clé par `savedTripId + date`.
 */

import { z } from "zod";
import { AiItineraryDraftSchema } from "@/lib/agents/itinerary-types";

// ---------------------------------------------------------------------------
// Saisie persistée (formState)
// ---------------------------------------------------------------------------

/**
 * Étape utilisateur saisie dans `StopList` (Mode A et Mode B).
 * Aligné sur le type runtime de `components/plan/StopList.tsx` :
 * `fixedDate` est `null` quand l'utilisateur laisse l'algo proposer.
 */
export const PlanStopSchema = z.object({
  city: z.string(),
  nights: z.number().int().min(0).max(60),
  fixedDate: z.union([z.string(), z.null()]),
});
export type PlanStop = z.infer<typeof PlanStopSchema>;

/** Saisie Mode A — voyage planifié. */
export const PlannedFormStateSchema = z.object({
  mode: z.literal("planned"),
  origin: z.string(),
  destination: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
  stops: z.array(PlanStopSchema),
  desires: z.string(),
});
export type PlannedFormState = z.infer<typeof PlannedFormStateSchema>;

/**
 * Intention du foyer pour la durée du voyage. Le solveur reçoit toujours des
 * bornes `minNights/maxNights` ; l'UI les calcule à partir de l'intention
 * choisie + la fenêtre saisie. `custom` débloque les bornes éditables.
 */
export const TripIntentSchema = z.enum(["maximize", "fastest", "custom"]);
export type TripIntent = z.infer<typeof TripIntentSchema>;

/** Saisie Mode B — voyage avec ancre. */
export const AnchoredFormStateSchema = z.object({
  mode: z.literal("anchored"),
  anchorTitle: z.string(),
  anchorCity: z.string(),
  /** Premier jour de l'ancre (événement ponctuel ou début du séjour). */
  anchorStartDate: z.string(),
  /** Dernier jour de l'ancre. Égal à `anchorStartDate` pour un événement ponctuel. */
  anchorEndDate: z.string(),
  /** Heure de début le 1er jour de l'ancre (HH:mm). */
  anchorStartTime: z.string(),
  /** Heure de fin le dernier jour de l'ancre (HH:mm). */
  anchorEndTime: z.string(),
  originCity: z.string(),
  earliestStart: z.string(),
  latestEnd: z.string(),
  /** Intention de voyage : maximiser / au plus rapide / sur mesure. */
  intent: TripIntentSchema.default("maximize"),
  /** Bornes effectives (auto-dérivées si `intent !== "custom"`). */
  minNights: z.number().int().min(1).max(60),
  maxNights: z.number().int().min(1).max(60),
  stops: z.array(PlanStopSchema),
});
export type AnchoredFormState = z.infer<typeof AnchoredFormStateSchema>;

// ── Helpers d'intention (purs) ─────────────────────────────────────────────

/** Calcule la durée en jours entre deux dates ISO (inclusive). */
function inclusiveDays(startIso: string, endIso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    return 1;
  }
  const ms = Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Traduit une intention en bornes `[min, max]` de nuits, en s'appuyant sur la
 * fenêtre et la durée du bloc d'ancre. Si `intent === "custom"`, on renvoie
 * les bornes explicites stockées dans le state.
 */
export function nightsFromIntent(form: {
  intent: TripIntent;
  earliestStart: string;
  latestEnd: string;
  anchorStartDate: string;
  anchorEndDate: string;
  minNights: number;
  maxNights: number;
}): { minNights: number; maxNights: number } {
  if (form.intent === "custom") {
    const min = Math.max(1, form.minNights);
    const max = Math.max(min, form.maxNights);
    return { minNights: min, maxNights: max };
  }
  // Fenêtre disponible (nuits max possibles dans la fenêtre).
  const windowNights = Math.max(1, inclusiveDays(form.earliestStart, form.latestEnd) - 1);
  // Bloc d'ancre (jours consécutifs).
  const anchorNights = Math.max(0, inclusiveDays(form.anchorStartDate, form.anchorEndDate) - 1);
  if (form.intent === "fastest") {
    // Au plus rapide : juste l'ancre + 1 nuit aller-retour.
    const fast = Math.max(1, anchorNights + 1);
    return { minNights: fast, maxNights: Math.min(windowNights, fast + 1) };
  }
  // maximize : prend toute la fenêtre disponible.
  return {
    minNights: Math.max(1, Math.min(windowNights, windowNights - 1)),
    maxNights: windowNights,
  };
}

export const FormStateSchema = z.discriminatedUnion("mode", [
  PlannedFormStateSchema,
  AnchoredFormStateSchema,
]);
export type FormState = z.infer<typeof FormStateSchema>;

// ---------------------------------------------------------------------------
// SavedTrip — voyage sauvegardé complet
// ---------------------------------------------------------------------------

/**
 * Candidat de synthèse (Mode B). On stocke en tant qu'`unknown` pour éviter
 * une dépendance circulaire avec `synthesis/types` — la validation tolère le
 * payload tel que renvoyé par `/api/synthesis`.
 */
const TripCandidateLooseSchema = z.unknown();
const DateOptionLooseSchema = z.unknown();

export const SavedTripStatusSchema = z.enum(["draft", "validated", "archived"]);
export type SavedTripStatus = z.infer<typeof SavedTripStatusSchema>;

export const SavedTripSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  status: SavedTripStatusSchema,
  mode: z.enum(["planned", "anchored"]),
  formState: FormStateSchema,
  // Résultat Mode A
  draft: AiItineraryDraftSchema.optional(),
  draftSource: z.enum(["ai", "mock"]).optional(),
  // Résultat Mode B
  candidates: z.array(TripCandidateLooseSchema).optional(),
  selectedCandidateIdx: z.number().int().min(0).optional(),
  dateOptions: z.array(DateOptionLooseSchema).optional(),
  /** Requête de synthèse RÉELLEMENT consommée (enrichie serveur) — pour le journal de debug. */
  effectiveSynthesisRequest: z.unknown().optional(),
  // Promotion vers le carnet
  promotedTripPlanId: z.string().optional(),
  promotedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedTrip = z.infer<typeof SavedTripSchema>;

// ---------------------------------------------------------------------------
// Snapshots de disponibilité hôtel (rafraîchissables)
// ---------------------------------------------------------------------------

/** Snapshot live R5 d'une nuit donnée (date + ville). */
export interface LodgingSnapshot {
  /** Clé composite `${savedTripId}-${date}-${slugCity}`. */
  id: string;
  savedTripId: string;
  date: string;
  city: string;
  lat: number;
  lng: number;
  /** Réponse brute de `/api/lodging/availability` à l'instant `readAt`. */
  result: {
    offers: unknown[];
    sourceName: string;
    notes: string[];
  };
  readAt: string;
}

// ---------------------------------------------------------------------------
// Helpers de construction (purs)
// ---------------------------------------------------------------------------

/** Slug stable pour clé composite snapshot (sans dépendance lourde). */
export function slugCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Suggère un nom de voyage à partir du formState (jamais vide). */
export function suggestedTripName(form: FormState): string {
  if (form.mode === "planned") {
    const o = form.origin.trim();
    const d = form.destination.trim();
    if (o && d) return `${o} → ${d}`;
    if (d) return `Voyage à ${d}`;
    if (o) return `Voyage depuis ${o}`;
    return "Voyage planifié";
  }
  const title = form.anchorTitle.trim();
  const city = form.anchorCity.trim();
  if (title && city) return `${title} (${city})`;
  if (title) return title;
  if (city) return `Voyage à ${city}`;
  return "Voyage avec ancre";
}

/** Génère un id court (suffisant pour 1 utilisateur, 1 IndexedDB local). */
export function newSavedTripId(): string {
  // crypto.randomUUID est dispo côté navigateur (sécure & unique).
  // Fallback déterministe pour Node de test : timestamp + suffix.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `st_${crypto.randomUUID()}`;
  }
  return `st_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
