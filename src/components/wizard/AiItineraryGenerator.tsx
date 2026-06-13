"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadActiveProfile } from "@/lib/db";
import { summarizeProfile } from "@/lib/profile/profile";
import { REFERENCE_TRIP_REQUEST } from "@/data/voyage-reference";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import { formatHm } from "@/lib/routing/realistic-time";

export function AiItineraryGenerator() {
  const [destination, setDestination] = useState(REFERENCE_TRIP_REQUEST.destination);
  const [dateFrom, setDateFrom] = useState("2026-08-03");
  const [dateTo, setDateTo] = useState("2026-08-09");
  const [description, setDescription] = useState(
    "Un voyage en famille tranquille, étapes culturelles et nature, avec du télétravail en semaine.",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"mock" | "ai" | null>(null);
  const [draft, setDraft] = useState<AiItineraryDraft | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const profile = await loadActiveProfile();
      const constraints = summarizeProfile(profile).map((l) => `${l.label} : ${l.value} — ${l.note}`);
      const res = await fetch("/api/agents/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          destination,
          dateFrom,
          dateTo,
          constraints,
          workDays: profile.work.workDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Génération impossible");
      setDraft(data.draft as AiItineraryDraft);
      setSource(data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de génération");
    } finally {
      setLoading(false);
    }
  }

  function updateDayTitle(index: number, title: string) {
    setDraft((d) =>
      d ? { ...d, days: d.days.map((day, i) => (i === index ? { ...day, title } : day)) } : d,
    );
  }

  function updateDayActivities(index: number, text: string) {
    const activities = text.split("\n").map((s) => s.trimEnd()).filter((s) => s.length > 0);
    setDraft((d) =>
      d ? { ...d, days: d.days.map((day, i) => (i === index ? { ...day, activities } : day)) } : d,
    );
  }

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Générer par IA
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Décrivez votre voyage : l&apos;IA propose un itinéraire structuré et éditable, calé sur le Profil Foyer.
        </p>
      </div>

      <Field label="Destination">
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="h-11 px-3 rounded-lg w-full text-sm"
          style={inputStyle}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Du">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </Field>
        <Field label="Au">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Description du voyage">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="p-3 rounded-lg w-full text-sm resize-y"
          style={inputStyle}
        />
      </Field>

      <Button onClick={generate} loading={loading} disabled={loading}>
        Proposer un itinéraire
      </Button>

      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-3" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Brouillon — {draft.destination}
            </h3>
            {source && (
              <span className={source === "ai" ? "badge-verified" : "badge-seed"}>
                {source === "ai" ? "Généré par Claude" : "Démo (mock)"}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {draft.summary}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {draft.constraintsApplied.map((c, i) => (
              <span key={i} className="badge-estimated">
                {c}
              </span>
            ))}
          </div>

          <ol className="space-y-2">
            {draft.days.map((day, i) => (
              <li
                key={day.date}
                className="p-3 rounded-lg space-y-2"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
              >
                <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {day.date}
                </div>
                <input
                  aria-label={`Titre du ${day.date}`}
                  value={day.title}
                  onChange={(e) => updateDayTitle(i, e.target.value)}
                  className="h-10 px-2 rounded w-full text-sm font-medium"
                  style={inputStyle}
                />
                <textarea
                  aria-label={`Activités du ${day.date}`}
                  value={day.activities.join("\n")}
                  onChange={(e) => updateDayActivities(i, e.target.value)}
                  rows={Math.max(2, day.activities.length)}
                  className="p-2 rounded w-full text-xs resize-y"
                  style={inputStyle}
                />
                {day.leg && (
                  <div
                    className="rounded-lg p-3 space-y-1.5"
                    style={{
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        Trajet — {day.leg.fromTo}
                      </p>
                      <span
                        className={
                          day.leg.source === "verified"
                            ? "badge-verified"
                            : day.leg.source === "seed"
                              ? "badge-seed"
                              : "badge-estimated"
                        }
                      >
                        {day.leg.source === "verified"
                          ? "Vérifié (OSRM)"
                          : day.leg.source === "seed"
                            ? "Table seed"
                            : "Estimé"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {day.leg.distanceKm} km · {formatHm(day.leg.totalMinutes)} au total
                    </p>
                    <ul className="text-xs space-y-0.5" style={{ color: "var(--text-secondary)" }}>
                      <li>Conduite : {formatHm(day.leg.drivingMinutes)}</li>
                      {day.leg.trafficMarginMinutes > 0 && (
                        <li>Trafic estimé : +{formatHm(day.leg.trafficMarginMinutes)}</li>
                      )}
                      {day.leg.pauseMinutes > 0 && (
                        <li>Pauses bébé : +{formatHm(day.leg.pauseMinutes)}</li>
                      )}
                      {day.leg.chargingMinutes > 0 && (
                        <li>Recharge(s) : +{formatHm(day.leg.chargingMinutes)}</li>
                      )}
                    </ul>
                    <p className="text-xs italic" style={{ color: "var(--text-secondary)" }}>
                      {day.leg.trafficNote}
                    </p>
                  </div>
                )}
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Nuit : {day.lodgingHint}
                </p>
                {day.constraintNotes.length > 0 && (
                  <ul className="text-xs space-y-0.5" style={{ color: "var(--text-muted)" }}>
                    {day.constraintNotes.map((n, j) => (
                      <li key={j}>— {n}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
