/**
 * `DraftPreview` — affichage du brouillon IA généré (Mode A).
 *
 * Le brouillon est **éditable** par l'utilisateur (titre + activités libres
 * par jour) et accompagné du trajet réaliste (`leg`) calculé serveur, des
 * contraintes appliquées, et de la source (Claude / mock).
 */
"use client";

import { useState } from "react";
import type { AiItineraryDraft } from "@/lib/agents/itinerary-types";
import { formatHm } from "@/lib/routing/realistic-time";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

interface DraftPreviewProps {
  initial: AiItineraryDraft;
  source: "ai" | "mock";
}

export function DraftPreview({ initial, source }: DraftPreviewProps) {
  // Pattern « reset state from props » sans useEffect (React 19) : on suit la
  // dernière prop reçue et on resynchronise pendant le render quand elle change.
  const [draft, setDraft] = useState<AiItineraryDraft>(initial);
  const [prevInitial, setPrevInitial] = useState<AiItineraryDraft>(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setDraft(initial);
  }

  function updateDayTitle(index: number, title: string) {
    setDraft((d) => ({
      ...d,
      days: d.days.map((day, i) => (i === index ? { ...day, title } : day)),
    }));
  }

  function updateDayActivities(index: number, text: string) {
    const activities = text
      .split("\n")
      .map((s) => s.trimEnd())
      .filter((s) => s.length > 0);
    setDraft((d) => ({
      ...d,
      days: d.days.map((day, i) =>
        i === index ? { ...day, activities } : day,
      ),
    }));
  }

  return (
    <section className="card p-5 space-y-4" aria-live="polite">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2
          className="font-semibold text-lg"
          style={{ color: "var(--text-primary)" }}
        >
          Brouillon — {draft.destination}
        </h2>
        <span
          className={source === "ai" ? "badge-verified" : "badge-seed"}
        >
          {source === "ai" ? "Généré par Claude" : "Démo (mock)"}
        </span>
      </header>

      <p
        className="text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        {draft.summary}
      </p>

      {draft.constraintsApplied.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {draft.constraintsApplied.map((c, i) => (
            <span key={i} className="badge-estimated">
              {c}
            </span>
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {draft.days.map((day, i) => (
          <li
            key={day.date}
            className="rounded-lg p-3 space-y-2"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              className="text-xs font-mono"
              style={{ color: "var(--text-muted)" }}
            >
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
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
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
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {day.leg.distanceKm} km · {formatHm(day.leg.totalMinutes)} au total
                </p>
                <ul
                  className="text-xs space-y-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
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
                <p
                  className="text-xs italic"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {day.leg.trafficNote}
                </p>
              </div>
            )}

            <p
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Nuit : {day.lodgingHint}
            </p>

            {day.constraintNotes.length > 0 && (
              <ul
                className="text-xs space-y-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {day.constraintNotes.map((n, j) => (
                  <li key={j}>— {n}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
