/**
 * `CandidatesPreview` — affichage des voyages composés (Mode B).
 *
 * Liste les candidats par ambiance (Reposant, Sociable, Découvreur, Thème),
 * expose le « regret » (ce qu'un voyage ne prend pas), propose le cadran de
 * dates flexibles, et permet d'enrichir le récit du voyage choisi par IA
 * (avec repli sur le gabarit gratuit). Aucune sélection n'exclut — on classe.
 */
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { templateNarrative } from "@/lib/synthesis/narrative";
import type { TripCandidate } from "@/lib/synthesis/types";
import type { DateOption } from "@/lib/synthesis/date-flex";

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

interface CandidatesPreviewProps {
  candidates: TripCandidate[];
  dateOptions: DateOption[];
}

export function CandidatesPreview({
  candidates,
  dateOptions,
}: CandidatesPreviewProps) {
  const [selected, setSelected] = useState(0);
  const [enriched, setEnriched] = useState<{
    idx: number;
    text: string;
    source: string;
  } | null>(null);
  const [narrating, setNarrating] = useState(false);

  // Pattern « reset from props » React 19 : on resynchronise pendant le render
  // quand une nouvelle liste de candidats arrive.
  const [prevCandidates, setPrevCandidates] = useState(candidates);
  if (prevCandidates !== candidates) {
    setPrevCandidates(candidates);
    setSelected(0);
    setEnriched(null);
  }

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    candidates.forEach((c) =>
      c.days.forEach((d) =>
        d.stops.forEach((s) => {
          if (s.opportunityId) m.set(s.opportunityId, s.title);
        }),
      ),
    );
    return m;
  }, [candidates]);

  const allIds = useMemo(
    () => new Set(candidates.flatMap((c) => c.includedOpportunityIds)),
    [candidates],
  );

  const chosen = candidates[selected] ?? null;
  const narrative = enriched && enriched.idx === selected ? enriched : null;

  async function enrichNarrative() {
    if (!chosen) return;
    setNarrating(true);
    try {
      const res = await fetch("/api/synthesis/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: chosen }),
      });
      const data = await res.json();
      if (res.ok && data.text)
        setEnriched({ idx: selected, text: data.text, source: data.source });
    } catch {
      // On garde le gabarit en cas d'échec.
    } finally {
      setNarrating(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <section className="card p-5">
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Aucun voyage composé. Ajustez la fenêtre ou les étapes et relancez.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6" aria-live="polite">
      <section className="space-y-3">
        <h2
          className="font-bold text-lg"
          style={{ color: "var(--text-primary)" }}
        >
          {candidates.length} voyage{candidates.length > 1 ? "s" : ""} composé{candidates.length > 1 ? "s" : ""}
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
                className="text-left rounded-xl p-4 transition-all min-h-[44px]"
                style={{
                  background: active
                    ? "var(--bg-surface)"
                    : "var(--bg-base)",
                  border: `2px solid ${
                    active
                      ? "var(--accent-amber)"
                      : "var(--border-default)"
                  }`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.label}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {c.startDate} → {c.endDate}
                  </span>
                </div>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {c.includedOpportunityIds.length} étape
                  {c.includedOpportunityIds.length > 1 ? "s" : ""} ·{" "}
                  {hm(c.totalDriveMinutes)} de route
                  {c.caniculeExposureDays > 0
                    ? ` · ${c.caniculeExposureDays} j de vigilance chaleur`
                    : ""}
                </p>
                {regret.length > 0 && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Ne prend pas : {regret.slice(0, 3).join(", ")}
                    {regret.length > 3 ? "…" : ""}
                  </p>
                )}
                {c.conflicts.length > 0 && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ⚠️ {c.conflicts[0]}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {dateOptions.length > 0 && (
        <section className="space-y-2">
          <h2
            className="font-bold text-lg"
            style={{ color: "var(--text-primary)" }}
          >
            Et si on bougeait les dates ?
          </h2>
          <ul className="space-y-2">
            {dateOptions.map((o) => (
              <li key={o.startDate} className="card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Départ le {o.startDate} — {o.bestAmbiance}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {o.includedCount} étapes
                  </span>
                </div>
                {o.caniculeDays > 0 && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {o.caniculeDays} jour(s) de vigilance chaleur
                  </p>
                )}
                {o.unlocked.length > 0 && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Débloque : {o.unlocked.join(", ")}
                  </p>
                )}
                {o.lost.length > 0 && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Renonce à : {o.lost.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2
              className="font-bold text-lg"
              style={{ color: "var(--text-primary)" }}
            >
              Récit — {chosen.label}
            </h2>
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {narrative?.source === "ai" ? "Récit enrichi (IA)" : "Récit gabarit"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={enrichNarrative}
                loading={narrating}
                disabled={narrating}
              >
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
