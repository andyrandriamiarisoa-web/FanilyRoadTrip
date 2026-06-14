"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PeopleEditor } from "./PeopleEditor";
import { REFERENCE_REQUEST, REFERENCE_ANCHOR } from "@/data/synthesis-fixtures";
import { templateNarrative } from "@/lib/synthesis/narrative";
import type { Person, TripCandidate } from "@/lib/synthesis/types";
import type { DateOption } from "@/lib/synthesis/date-flex";

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

/**
 * Écran « Composer » (S1–S3, S6) : à partir d'une **ancre** (mariage) + des
 * envies + le Profil Foyer, l'app **compose** plusieurs voyages datés (dates
 * de début/fin calculées). On choisit une ambiance, on explore le cadran de
 * dates, et on lit le récit gabarit. Mock-first ; source toujours affichée.
 */
export function Composer() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<TripCandidate[] | null>(null);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enriched, setEnriched] = useState<{ idx: number; text: string; source: string } | null>(null);
  const [narrating, setNarrating] = useState(false);

  async function compose() {
    setLoading(true);
    setError(null);
    try {
      const req = { ...REFERENCE_REQUEST, people };
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de synthèse");
      setCandidates(data.candidates ?? []);
      setDateOptions(data.dateOptions ?? []);
      setSelected(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de synthèse");
    } finally {
      setLoading(false);
    }
  }

  // Carte id → titre (pour exposer le « regret » : ce qu'un voyage ne prend pas).
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    (candidates ?? []).forEach((c) =>
      c.days.forEach((d) => d.stops.forEach((s) => { if (s.opportunityId) m.set(s.opportunityId, s.title); })),
    );
    return m;
  }, [candidates]);

  const allIds = useMemo(
    () => new Set((candidates ?? []).flatMap((c) => c.includedOpportunityIds)),
    [candidates],
  );

  async function enrichNarrative() {
    if (!chosen) return;
    setNarrating(true);
    try {
      const res = await fetch("/api/synthesis/narrative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate: chosen }),
      });
      const data = await res.json();
      if (res.ok && data.text) setEnriched({ idx: selected, text: data.text, source: data.source });
    } catch {
      // On garde le gabarit en cas d'échec.
    } finally {
      setNarrating(false);
    }
  }

  const chosen = candidates?.[selected] ?? null;
  const narrative = enriched && enriched.idx === selected ? enriched : null;

  return (
    <div className="space-y-6">
      {/* Ancre */}
      <section className="card-warm p-4 space-y-1">
        <p className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>ANCRE DU VOYAGE</p>
        <p className="font-semibold" style={{ color: "var(--text-on-card-warm)" }}>{REFERENCE_ANCHOR.title}</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {REFERENCE_ANCHOR.start.slice(0, 10)} · fenêtre {REFERENCE_REQUEST.window.earliestStart} → {REFERENCE_REQUEST.window.latestEnd}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Les dates de départ et de retour sont <strong>calculées</strong>, pas saisies.
        </p>
      </section>

      <PeopleEditor onChange={setPeople} />

      <Button onClick={compose} loading={loading} disabled={loading} size="lg">
        Composer mes voyages
      </Button>

      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>{error}</p>
      )}

      {candidates && (
        <section className="space-y-3" aria-live="polite">
          <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            {candidates.length} voyages composés
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {candidates.map((c, i) => {
              const active = i === selected;
              const regret = [...allIds]
                .filter((id) => !c.includedOpportunityIds.includes(id))
                .map((id) => titleById.get(id) ?? id);
              return (
                <button
                  key={c.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(i)}
                  className="text-left rounded-xl p-4 transition-all"
                  style={{
                    background: active ? "var(--bg-surface)" : "var(--bg-base)",
                    border: `2px solid ${active ? "var(--accent-amber)" : "var(--border-default)"}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{c.label}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {c.startDate} → {c.endDate}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    {c.includedOpportunityIds.length} étapes · {hm(c.totalDriveMinutes)} de route
                    {c.caniculeExposureDays > 0 ? ` · ${c.caniculeExposureDays} j de vigilance chaleur` : ""}
                  </p>
                  {regret.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Ne prend pas : {regret.slice(0, 3).join(", ")}{regret.length > 3 ? "…" : ""}
                    </p>
                  )}
                  {c.conflicts.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      ⚠️ {c.conflicts[0]}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Cadran de dates */}
      {dateOptions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Et si on bougeait les dates ?</h2>
          <ul className="space-y-2">
            {dateOptions.map((o) => (
              <li key={o.startDate} className="card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    Départ le {o.startDate} — {o.bestAmbiance}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>{o.includedCount} étapes</span>
                </div>
                {o.caniculeDays > 0 && (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{o.caniculeDays} jour(s) de vigilance chaleur</p>
                )}
                {o.unlocked.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Débloque : {o.unlocked.join(", ")}</p>
                )}
                {o.lost.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Renonce à : {o.lost.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Récit du voyage choisi (gabarit gratuit ; enrichi par IA à la demande) */}
      {chosen && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Récit — {chosen.label}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {narrative?.source === "ai" ? "Récit enrichi (IA)" : "Récit gabarit"}
              </span>
              <Button variant="secondary" size="sm" onClick={enrichNarrative} loading={narrating} disabled={narrating}>
                Enrichir le récit (IA)
              </Button>
            </div>
          </div>
          <pre
            className="card p-4 text-sm whitespace-pre-wrap font-sans"
            style={{ color: "var(--text-primary)" }}
          >
            {narrative?.text ?? templateNarrative(chosen)}
          </pre>
        </section>
      )}
    </div>
  );
}
