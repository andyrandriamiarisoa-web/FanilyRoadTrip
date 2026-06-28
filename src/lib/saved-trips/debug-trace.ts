/**
 * Journal de debug du carnet — assemble **tous les inputs/outputs** ayant
 * servi à composer un voyage, à partir des données **persistées** (donc
 * disponible rétroactivement, sans avoir à reproduire le cas).
 *
 * Stratégie : on **reconstruit** la requête envoyée au moteur (synthèse Mode B
 * ou itinéraire IA Mode A) via les mêmes builders purs que les formulaires
 * (`request-builders.ts`) — ce qui figure dans le journal est donc exactement
 * ce qui a été soumis. Les sorties (candidats / brouillon / TripPlan /
 * snapshots de dispos) sont lues telles quelles depuis le stockage.
 *
 * Aucune donnée n'est inventée ; les écarts possibles (profil modifié depuis
 * la promotion, villes non géocodables, nuits sans coordonnées) sont
 * explicitement signalés dans `warnings`.
 */

import type { FamilyProfile, TripPlan } from "@/types";
import type {
  AnchoredFormState,
  PlannedFormState,
  SavedTrip,
  LodgingSnapshot,
} from "./types";
import {
  buildSynthesisRequest,
  buildItineraryRequestBody,
} from "./request-builders";

export interface DebugTrace {
  schemaVersion: number;
  generatedAt: string;
  note: string;
  appMode: string;
  warnings: string[];
  savedTrip: {
    id: string;
    name: string;
    status: string;
    mode: string;
    createdAt: string;
    updatedAt: string;
    promotedTripPlanId?: string;
    promotedAt?: string;
  };
  profileSnapshot: {
    id: string;
    version: number;
    updatedAt: string;
    profile: FamilyProfile;
  };
  inputs: {
    formState: AnchoredFormState | PlannedFormState;
  };
  /** Reconstruction de la requête moteur (Mode B = synthèse, Mode A = IA). */
  reconstructedRequest: unknown;
  /** Sorties du moteur telles que persistées. */
  engineOutputs: {
    candidates?: unknown[];
    selectedCandidateIdx?: number;
    selectedCandidate?: unknown;
    dateOptions?: unknown[];
    draft?: unknown;
    draftSource?: string;
  };
  /** Le carnet final (TripPlan) effectivement affiché. */
  tripPlan: TripPlan | null;
  /** Snapshots de dispos hôtel rafraîchis (sorties R5), si présents. */
  lodgingSnapshots: LodgingSnapshot[];
}

const SCHEMA_VERSION = 1;

export interface BuildDebugTraceInput {
  savedTrip: SavedTrip;
  tripPlan: TripPlan | null;
  profile: FamilyProfile;
  lodgingSnapshots?: LodgingSnapshot[];
  appMode: string;
  /** Horodatage injecté (déterminisme des tests). Défaut : maintenant. */
  generatedAt: string;
}

export function buildDebugTrace(input: BuildDebugTraceInput): DebugTrace {
  const { savedTrip, tripPlan, profile, appMode, generatedAt } = input;
  const warnings: string[] = [];

  // Avertissement : le profil a-t-il bougé depuis la promotion ?
  if (savedTrip.promotedAt && profile.updatedAt > savedTrip.promotedAt) {
    warnings.push(
      `Le Profil Foyer a été modifié (v${profile.version}, ${profile.updatedAt}) APRÈS la promotion au carnet (${savedTrip.promotedAt}). La requête reconstruite reflète le profil ACTUEL, pas forcément celui utilisé à la composition.`,
    );
  }

  let reconstructedRequest: unknown = null;
  const engineOutputs: DebugTrace["engineOutputs"] = {};

  if (savedTrip.formState.mode === "anchored") {
    const form = savedTrip.formState;
    const built = buildSynthesisRequest(form, profile);
    reconstructedRequest = {
      kind: "synthesis",
      endpoint: "/api/synthesis",
      request: built.request,
      derivedNights: built.derivedNights,
      effectiveAnchorEnd: built.effectiveAnchorEnd,
      unknownStops: built.unknownStops,
      buildError: built.error,
    };
    if (built.error) warnings.push(`Reconstruction requête synthèse : ${built.error}`);
    if (built.unknownStops.length > 0) {
      warnings.push(
        `Étape(s) ignorée(s) par le solveur (ville inconnue de la table seed) : ${built.unknownStops.join(", ")}`,
      );
    }
    const candidates = savedTrip.candidates ?? [];
    const idx = savedTrip.selectedCandidateIdx ?? 0;
    engineOutputs.candidates = candidates;
    engineOutputs.selectedCandidateIdx = idx;
    engineOutputs.selectedCandidate = candidates[idx];
    engineOutputs.dateOptions = savedTrip.dateOptions ?? [];
    if (candidates.length === 0) {
      warnings.push("Aucun candidat persisté : le voyage a-t-il bien été composé avant promotion ?");
    }
  } else {
    const form = savedTrip.formState;
    reconstructedRequest = {
      kind: "itinerary",
      endpoint: "/api/agents/itinerary",
      request: buildItineraryRequestBody(form, profile),
    };
    engineOutputs.draft = savedTrip.draft;
    engineOutputs.draftSource = savedTrip.draftSource;
    if (!savedTrip.draft) {
      warnings.push("Aucun brouillon IA persisté : le voyage a-t-il bien été généré avant promotion ?");
    }
  }

  // Cohérence carnet ↔ voyage sauvegardé.
  if (tripPlan && savedTrip.promotedTripPlanId && tripPlan.id !== savedTrip.promotedTripPlanId) {
    warnings.push(
      `Le carnet affiché (${tripPlan.id}) n'est pas celui promu par ce voyage (${savedTrip.promotedTripPlanId}) — un autre voyage a peut-être été promu depuis.`,
    );
  }
  if (!tripPlan) {
    warnings.push("Aucun TripPlan associé : carnet vide ou voyage non encore promu.");
  } else {
    const daysNoCoords = tripPlan.days.filter(
      (d) => d.lodging && (d.lodging.lat === undefined || d.lodging.lng === undefined),
    );
    if (daysNoCoords.length > 0) {
      warnings.push(
        `${daysNoCoords.length} nuit(s) sans coordonnées d'hébergement — le rafraîchissement des dispos sera impossible pour ces dates : ${daysNoCoords.map((d) => d.date).join(", ")}`,
      );
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    note:
      "Journal de diagnostic. La requête moteur est RECONSTRUITE depuis le formState + le Profil Foyer actuel via les mêmes builders que les formulaires. Les sorties (candidats / brouillon / TripPlan / snapshots) sont lues telles quelles depuis IndexedDB.",
    appMode,
    warnings,
    savedTrip: {
      id: savedTrip.id,
      name: savedTrip.name,
      status: savedTrip.status,
      mode: savedTrip.mode,
      createdAt: savedTrip.createdAt,
      updatedAt: savedTrip.updatedAt,
      promotedTripPlanId: savedTrip.promotedTripPlanId,
      promotedAt: savedTrip.promotedAt,
    },
    profileSnapshot: {
      id: profile.id,
      version: profile.version,
      updatedAt: profile.updatedAt,
      profile,
    },
    inputs: { formState: savedTrip.formState },
    reconstructedRequest,
    engineOutputs,
    tripPlan,
    lodgingSnapshots: input.lodgingSnapshots ?? [],
  };
}

/** Nom de fichier stable pour le journal téléchargé. */
export function debugTraceFilename(savedTrip: Pick<SavedTrip, "name">, generatedAt: string): string {
  const slug = savedTrip.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  return `odyssee-debug-${slug || "voyage"}-${stamp}.json`;
}
