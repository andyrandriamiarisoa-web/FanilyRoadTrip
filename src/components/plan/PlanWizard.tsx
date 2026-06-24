/**
 * `PlanWizard` — racine de la page `/plan`. Sélecteur de mode entre
 * **Voyage planifié** (Mode A — départ/retour + étapes) et **Voyage avec
 * ancre** (Mode B — événement fixe + durée). Affiche le formulaire actif
 * et le résultat sous la forme adaptée (brouillon IA ou candidats composés).
 *
 * Mock-first : tout fonctionne sans aucune clé. Anti-pattern #1 respecté :
 * on classe sans exclure, on ne filtre pas les voyages improbables.
 */
"use client";

import { useState } from "react";
import { ModeSelector, type PlanMode } from "./ModeSelector";
import { PlannedTripForm } from "./PlannedTripForm";
import { AnchoredTripForm } from "./AnchoredTripForm";
import { DraftPreview } from "./DraftPreview";
import { CandidatesPreview } from "./CandidatesPreview";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import type { TripCandidate } from "@/lib/synthesis/types";
import type { DateOption } from "@/lib/synthesis/date-flex";

type Result =
  | { kind: "draft"; draft: AiItineraryDraft; source: "ai" | "mock" }
  | { kind: "candidates"; candidates: TripCandidate[]; dateOptions: DateOption[] };

export function PlanWizard() {
  const [mode, setMode] = useState<PlanMode>("planned");
  const [result, setResult] = useState<Result | null>(null);

  function switchMode(next: PlanMode) {
    setMode(next);
    setResult(null);
  }

  return (
    <div className="space-y-6">
      <ModeSelector value={mode} onChange={switchMode} />

      {mode === "planned" ? (
        <PlannedTripForm
          onDraft={(draft, source) =>
            setResult({ kind: "draft", draft, source })
          }
        />
      ) : (
        <AnchoredTripForm
          onResult={(r) =>
            setResult({
              kind: "candidates",
              candidates: r.candidates,
              dateOptions: r.dateOptions,
            })
          }
        />
      )}

      {result?.kind === "draft" && (
        <DraftPreview initial={result.draft} source={result.source} />
      )}
      {result?.kind === "candidates" && (
        <CandidatesPreview
          candidates={result.candidates}
          dateOptions={result.dateOptions}
        />
      )}
    </div>
  );
}
