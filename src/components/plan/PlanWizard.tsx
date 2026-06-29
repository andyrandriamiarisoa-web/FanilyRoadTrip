/**
 * `PlanWizard` — racine de la page `/plan`.
 *
 * Trois rôles :
 * 1) **Sélecteur de mode** entre *Voyage planifié* (A) et *Voyage avec ancre* (B).
 * 2) **Édition d'un voyage sauvegardé** : si la query string contient
 *    `?savedTripId=…`, on charge le `SavedTrip` correspondant et on restaure
 *    le formulaire et le résultat précédent.
 * 3) **Persistance** : bouton « Enregistrer le brouillon » au-dessus du
 *    formulaire (crée ou met à jour un `SavedTrip` `status: "draft"`), et
 *    bouton « Envoyer au carnet » sur la preview (promeut vers `TripPlan`).
 *
 * Mock-first : la promotion utilise `runMockOrchestrator` côté serveur ; en
 * LIVE, c'est le live-orchestrator.
 */
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  getSavedTrip,
  putSavedTrip,
  setActiveSavedTripId,
  getActiveSavedTripId,
  saveTrip,
  loadActiveProfile,
} from "@/lib/db";
import { ModeSelector, type PlanMode } from "./ModeSelector";
import {
  PlannedTripForm,
  emptyPlannedFormState,
} from "./PlannedTripForm";
import {
  AnchoredTripForm,
  emptyAnchoredFormState,
} from "./AnchoredTripForm";
import { DraftPreview } from "./DraftPreview";
import { CandidatesPreview } from "./CandidatesPreview";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import type { TripCandidate } from "@/lib/synthesis/types";
import type { DateOption } from "@/lib/synthesis/date-flex";
import type { TripPlan } from "@/types";
import {
  newSavedTripId,
  suggestedTripName,
  type AnchoredFormState,
  type PlannedFormState,
  type SavedTrip,
} from "@/lib/saved-trips/types";
import {
  candidateToTripPlan,
  draftToTripPlan,
} from "@/lib/saved-trips/build-trip-plan";

function newSavedTripFromMode(mode: PlanMode): SavedTrip {
  const now = new Date().toISOString();
  const formState =
    mode === "planned" ? emptyPlannedFormState() : emptyAnchoredFormState();
  return {
    id: newSavedTripId(),
    name: suggestedTripName(formState),
    status: "draft",
    mode,
    formState,
    createdAt: now,
    updatedAt: now,
  };
}

export function PlanWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("savedTripId");

  const [trip, setTrip] = useState<SavedTrip>(() => newSavedTripFromMode("planned"));
  const [hydrating, setHydrating] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Charger : (1) le voyage demandé via ?savedTripId, (2) sinon le voyage
  // actif (s'il y en a un et qu'il existe encore), (3) sinon un voyage neuf.
  useEffect(() => {
    let alive = true;
    async function hydrate() {
      try {
        const id = requestedId ?? (await getActiveSavedTripId());
        if (id) {
          const found = await getSavedTrip(id);
          if (alive && found) {
            setTrip(found);
            return;
          }
        }
      } finally {
        if (alive) setHydrating(false);
      }
    }
    void hydrate();
    return () => {
      alive = false;
    };
  }, [requestedId]);

  function flash(msg: string) {
    setFeedback(msg);
    setError(null);
    setTimeout(() => setFeedback(null), 3_000);
  }

  function failure(msg: string) {
    setError(msg);
    setFeedback(null);
  }

  function switchMode(next: PlanMode) {
    if (next === trip.mode) return;
    setTrip(newSavedTripFromMode(next));
    void setActiveSavedTripId(null);
  }

  function setFormPlanned(next: PlannedFormState) {
    setTrip((t) => ({
      ...t,
      mode: "planned",
      formState: next,
      name:
        t.status !== "draft" && t.name && t.name.length > 0
          ? t.name
          : suggestedTripName(next),
    }));
  }

  function setFormAnchored(next: AnchoredFormState) {
    setTrip((t) => ({
      ...t,
      mode: "anchored",
      formState: next,
      name:
        t.status !== "draft" && t.name && t.name.length > 0
          ? t.name
          : suggestedTripName(next),
    }));
  }

  function setDraft(draft: AiItineraryDraft, source: "ai" | "mock") {
    setTrip((t) => ({
      ...t,
      draft,
      draftSource: source,
      candidates: undefined,
      selectedCandidateIdx: undefined,
      dateOptions: undefined,
    }));
  }

  function setCandidates(
    candidates: TripCandidate[],
    dateOptions: DateOption[],
    effectiveRequest?: unknown,
  ) {
    setTrip((t) => ({
      ...t,
      candidates: candidates as unknown[],
      dateOptions: dateOptions as unknown[],
      effectiveSynthesisRequest: effectiveRequest,
      selectedCandidateIdx: 0,
      draft: undefined,
      draftSource: undefined,
    }));
  }

  async function saveDraft() {
    setSavingDraft(true);
    try {
      const proposedName =
        trip.name && trip.name.length > 0
          ? trip.name
          : suggestedTripName(trip.formState);
      const saved = await putSavedTrip({
        ...trip,
        name: proposedName,
        status: trip.status === "validated" ? "validated" : "draft",
      });
      setTrip(saved);
      await setActiveSavedTripId(saved.id);
      flash("Brouillon enregistré.");
    } catch (e) {
      failure(e instanceof Error ? e.message : "Échec d'enregistrement");
    } finally {
      setSavingDraft(false);
    }
  }

  async function promoteToCarnet() {
    setPromoting(true);
    try {
      const profile = await loadActiveProfile();
      let plan: TripPlan;
      if (trip.mode === "anchored") {
        if (!trip.candidates || trip.candidates.length === 0) {
          throw new Error("Aucun candidat à promouvoir. Compose d'abord les voyages.");
        }
        const idx = trip.selectedCandidateIdx ?? 0;
        const candidate = trip.candidates[idx] as unknown as TripCandidate;
        plan = candidateToTripPlan(
          candidate,
          trip.formState as AnchoredFormState,
          { profileId: profile.id },
        );
      } else {
        if (!trip.draft) {
          throw new Error("Aucun brouillon à promouvoir. Génère d'abord l'itinéraire.");
        }
        plan = draftToTripPlan(
          trip.draft,
          trip.formState as PlannedFormState,
          { profileId: profile.id },
        );
      }
      await saveTrip(plan);
      const now = new Date().toISOString();
      const saved = await putSavedTrip({
        ...trip,
        status: "validated",
        promotedTripPlanId: plan.id,
        promotedAt: now,
        name:
          trip.name && trip.name.length > 0
            ? trip.name
            : suggestedTripName(trip.formState),
      });
      setTrip(saved);
      await setActiveSavedTripId(saved.id);
      router.push("/carnet");
    } catch (e) {
      failure(e instanceof Error ? e.message : "Promotion impossible");
    } finally {
      setPromoting(false);
    }
  }

  const hasResult =
    !!trip.draft ||
    (trip.candidates !== undefined && trip.candidates.length > 0);

  return (
    <div className="space-y-6">
      <ModeSelector value={trip.mode} onChange={switchMode} />

      <TripIdBanner
        trip={trip}
        onRename={async (next) => {
          const updated = await putSavedTrip({ ...trip, name: next });
          setTrip(updated);
          flash("Voyage renommé.");
        }}
      />

      {trip.mode === "planned" ? (
        <PlannedTripForm
          value={trip.formState as PlannedFormState}
          onChange={setFormPlanned}
          onDraft={setDraft}
          hasExisting={!!trip.draft}
        />
      ) : (
        <AnchoredTripForm
          value={trip.formState as AnchoredFormState}
          onChange={setFormAnchored}
          onResult={({ candidates, dateOptions, effectiveRequest }) =>
            setCandidates(candidates, dateOptions, effectiveRequest)
          }
          hasExisting={!!trip.candidates && trip.candidates.length > 0}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={saveDraft}
          loading={savingDraft}
          disabled={savingDraft || hydrating}
        >
          Enregistrer le brouillon
        </Button>
        {hasResult && (
          <Button
            onClick={promoteToCarnet}
            loading={promoting}
            disabled={promoting || hydrating}
          >
            Envoyer au carnet
          </Button>
        )}
        {feedback && (
          <span
            role="status"
            aria-live="polite"
            className="text-xs"
            style={{ color: "var(--accent-success)" }}
          >
            {feedback}
          </span>
        )}
        {error && (
          <span
            role="alert"
            className="text-xs"
            style={{ color: "var(--accent-danger)" }}
          >
            {error}
          </span>
        )}
      </div>

      {trip.draft && (
        <DraftPreview
          initial={trip.draft}
          source={trip.draftSource ?? "mock"}
        />
      )}
      {trip.candidates && trip.candidates.length > 0 && (
        <CandidatesPreview
          candidates={trip.candidates as unknown as TripCandidate[]}
          dateOptions={(trip.dateOptions ?? []) as unknown as DateOption[]}
        />
      )}
    </div>
  );
}

function TripIdBanner({
  trip,
  onRename,
}: {
  trip: SavedTrip;
  onRename: (next: string) => Promise<void>;
}) {
  const persisted = trip.status === "validated" || trip.status === "archived";
  if (!persisted) return null;
  const statusLabel = trip.status === "validated" ? "Validé" : "Archivé";
  return (
    <div
      className="rounded-lg p-3 text-sm flex items-center justify-between gap-2 flex-wrap"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="min-w-0">
        <p
          className="font-semibold truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {trip.name}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {statusLabel} · vous éditez ce voyage
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const next = window.prompt("Nouveau nom du voyage", trip.name);
          if (next && next.trim().length > 0) {
            await onRename(next.trim());
          }
        }}
        className="text-xs underline"
        style={{ color: "var(--text-secondary)" }}
      >
        Renommer
      </button>
    </div>
  );
}
