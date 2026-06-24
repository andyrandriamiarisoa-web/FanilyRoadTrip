/**
 * `PlannedTripForm` — formulaire du **Mode A — Voyage planifié**.
 *
 * Le state du formulaire (point de départ, destination, dates, étapes,
 * envies) est piloté depuis `PlanWizard` pour pouvoir le persister (voyage
 * sauvegardé) et le restaurer à la réouverture. Appelle `/api/agents/itinerary`
 * (Claude en LIVE, mock-first sans clé) ; les étapes structurées sont
 * sérialisées dans la description pour que le LLM les prenne en compte.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadActiveProfile } from "@/lib/db";
import { summarizeProfile } from "@/lib/profile/profile";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import type { PlannedFormState } from "@/lib/saved-trips/types";
import { CityAutocomplete } from "./CityAutocomplete";
import { StopList, type PlanStop } from "./StopList";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

interface PlannedTripFormProps {
  value: PlannedFormState;
  onChange: (next: PlannedFormState) => void;
  onDraft: (draft: AiItineraryDraft, source: "ai" | "mock") => void;
  /** True quand un voyage est déjà ouvert (modifie le libellé du bouton). */
  hasExisting: boolean;
}

function formatStopsForPrompt(stops: PlanStop[]): string {
  if (stops.length === 0) return "";
  const lines = stops
    .filter((s) => s.city.trim().length > 0)
    .map((s) => {
      const nights = s.nights > 0 ? `${s.nights} nuit${s.nights > 1 ? "s" : ""}` : "passage";
      const fixed = s.fixedDate ? ` (fixé au ${s.fixedDate})` : "";
      return `• ${s.city.trim()} — ${nights}${fixed}`;
    });
  if (lines.length === 0) return "";
  return `\n\nÉtapes à respecter :\n${lines.join("\n")}`;
}

export function PlannedTripForm({
  value,
  onChange,
  onDraft,
  hasExisting,
}: PlannedTripFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<PlannedFormState>) {
    onChange({ ...value, ...p });
  }

  const ready =
    value.origin.trim().length > 0 &&
    value.destination.trim().length > 0 &&
    value.dateFrom.length === 10 &&
    value.dateTo.length === 10 &&
    value.dateFrom <= value.dateTo;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await loadActiveProfile();
      const constraints = summarizeProfile(profile).map(
        (l) => `${l.label} : ${l.value} — ${l.note}`,
      );
      const prefix = `Voyage de ${value.origin.trim()} à ${value.destination.trim()}, du ${value.dateFrom} au ${value.dateTo}.`;
      const desiresClean = value.desires.trim();
      const description =
        prefix +
        formatStopsForPrompt(value.stops) +
        (desiresClean ? `\n\nEnvies : ${desiresClean}` : "");

      const res = await fetch("/api/agents/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          destination: value.destination.trim(),
          dateFrom: value.dateFrom,
          dateTo: value.dateTo,
          constraints,
          workDays: profile.work.workDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Génération impossible");
      onDraft(data.draft as AiItineraryDraft, data.source as "ai" | "mock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de génération");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card p-5 space-y-5" onSubmit={generate}>
      <header>
        <h2
          className="font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Voyage planifié
        </h2>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Renseignez le départ, la destination, les dates et les étapes à respecter.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CityAutocomplete
          label="Point de départ"
          value={value.origin}
          onChange={(v) => patch({ origin: v })}
          placeholder="ex. Paris"
          required
        />
        <CityAutocomplete
          label="Destination"
          value={value.destination}
          onChange={(v) => patch({ destination: v })}
          placeholder="ex. Marseille"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Date de départ
          </span>
          <input
            type="date"
            required
            value={value.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Date de retour
          </span>
          <input
            type="date"
            required
            value={value.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            min={value.dateFrom || undefined}
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </label>
      </div>

      <section className="space-y-2">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Étapes à respecter
        </h3>
        <p
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Optionnel. Chaque étape peut avoir une date fixée ou être laissée à l’algorithme.
        </p>
        <StopList
          stops={value.stops}
          onChange={(stops) => patch({ stops })}
          addLabel="Ajouter une étape"
          emptyHint="Aucune étape pour l'instant — l'algorithme proposera lui-même le découpage du trajet."
        />
      </section>

      <label className="flex flex-col gap-1.5">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Envies (optionnel)
        </span>
        <textarea
          value={value.desires}
          onChange={(e) => patch({ desires: e.target.value })}
          rows={3}
          placeholder="ex. étapes culturelles, nature, télétravail en semaine…"
          className="p-3 rounded-lg w-full text-sm resize-y"
          style={inputStyle}
        />
      </label>

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={loading || !ready}
        className="w-full"
      >
        {hasExisting ? "Re-générer l’itinéraire" : "Générer l’itinéraire"}
      </Button>

      {error && (
        <p
          className="text-sm"
          role="alert"
          style={{ color: "var(--accent-danger)" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}

/** State initial vierge pour un nouveau voyage planifié. */
export function emptyPlannedFormState(): PlannedFormState {
  return {
    mode: "planned",
    origin: "",
    destination: "",
    dateFrom: "",
    dateTo: "",
    stops: [],
    desires: "",
  };
}
