/**
 * `PlannedTripForm` — formulaire du **Mode A — Voyage planifié**.
 *
 * Saisie : point de départ + destination + dates départ/retour + étapes à
 * respecter (StopList) + description libre. Appelle `/api/agents/itinerary`
 * (Claude en LIVE, mock-first sans clé) ; les étapes structurées sont
 * sérialisées dans la description pour que le LLM les prenne en compte.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadActiveProfile } from "@/lib/db";
import { summarizeProfile } from "@/lib/profile/profile";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import { CityAutocomplete } from "./CityAutocomplete";
import { StopList, type PlanStop } from "./StopList";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

interface PlannedTripFormProps {
  onDraft: (draft: AiItineraryDraft, source: "ai" | "mock") => void;
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

export function PlannedTripForm({ onDraft }: PlannedTripFormProps) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stops, setStops] = useState<PlanStop[]>([]);
  const [desires, setDesires] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    origin.trim().length > 0 &&
    destination.trim().length > 0 &&
    dateFrom.length === 10 &&
    dateTo.length === 10 &&
    dateFrom <= dateTo;

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
      const prefix = `Voyage de ${origin.trim()} à ${destination.trim()}, du ${dateFrom} au ${dateTo}.`;
      const desiresClean = desires.trim();
      const description =
        prefix +
        formatStopsForPrompt(stops) +
        (desiresClean ? `\n\nEnvies : ${desiresClean}` : "");

      const res = await fetch("/api/agents/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          destination: destination.trim(),
          dateFrom,
          dateTo,
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
          value={origin}
          onChange={setOrigin}
          placeholder="ex. Paris"
          required
        />
        <CityAutocomplete
          label="Destination"
          value={destination}
          onChange={setDestination}
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
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
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
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
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
          stops={stops}
          onChange={setStops}
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
          value={desires}
          onChange={(e) => setDesires(e.target.value)}
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
        Générer l’itinéraire
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
