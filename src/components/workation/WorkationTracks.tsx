"use client";

import { useMemo } from "react";
import { planWorkationDay } from "@/lib/workation/day-plan";
import { formatHoursForDay, type RankedPoi } from "@/lib/poi/poi";
import type { Weekday } from "@/lib/profile/profile";
import { SourceBadge } from "@/components/ui/Badge";
import type { Poi } from "@/types";

const CATEGORY_LABELS: Record<Poi["category"], string> = {
  coworking: "Coworking",
  museum: "Musée",
  park: "Parc",
  attraction: "Visite",
  "aquarium-zoo": "Aquarium / Zoo",
  playground: "Aire de jeux",
  "family-restaurant": "Restaurant famille",
};

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, "0")}`;
}

export interface WorkationTracksProps {
  lodging: { lat: number; lng: number };
  date: string;
  workDays: readonly Weekday[];
  workWindow: [number, number];
  heatAlert?: boolean;
}

/**
 * Deux pistes parallèles pour un **jour de télétravail** (Lot R4) :
 * « Andy : coworking » et « Famille : plan de visites ». Tout vient des POI
 * ouverts ingérés (R2) ; rien n'est exclu, la source est toujours affichée.
 */
export function WorkationTracks(props: WorkationTracksProps) {
  const plan = useMemo(
    () =>
      planWorkationDay({
        lodging: props.lodging,
        date: props.date,
        workDays: props.workDays,
        workWindow: props.workWindow,
        heatAlert: props.heatAlert,
      }),
    [props.lodging, props.date, props.workDays, props.workWindow, props.heatAlert],
  );

  if (!plan.isWorkDay) return null;

  // Jour de semaine ISO (0 = lundi) pour afficher les horaires du bon jour.
  const dayIdx = (new Date(`${props.date}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Jour de télétravail — deux pistes
      </p>

      {/* Piste 1 : Andy — Coworking */}
      <div
        className="rounded-lg p-3 space-y-2"
        style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <span aria-hidden="true">💼 </span>Andy : coworking à proximité
        </p>
        {plan.coworking.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Aucun coworking référencé dans la zone — l&apos;hébergement devra fournir le poste de travail.
          </p>
        ) : (
          <ul className="space-y-2">
            {plan.coworking.slice(0, 3).map(({ poi, conformity }) => (
              <li key={poi.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {poi.name}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>{poi.distanceKm} km</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <ConformityChip ok={conformity.hasDesk} label="Bureau" />
                  <ConformityChip ok={conformity.hasWifi} label="Wifi" />
                  <ConformityChip ok={conformity.hasAc} label="Clim" />
                  <SourceBadge status={poi.sourceStatus} />
                  <span style={{ color: "var(--text-muted)" }}>· {poi.sourceName}</span>
                </div>
                <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Horaires {formatHoursForDay(poi, dayIdx)}
                </p>
                {conformity.notes.length > 0 && (
                  <p style={{ color: "var(--text-muted)" }}>{conformity.notes.join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Piste 2 : Famille — Plan de visites */}
      <div
        className="rounded-lg p-3 space-y-2"
        style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <span aria-hidden="true">👪 </span>Famille : plan de visites
        </p>
        {plan.family.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Aucune activité famille référencée à proximité dans nos données ouvertes.
          </p>
        ) : (
          <ol className="space-y-2">
            {plan.family.map((a, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="font-mono tabular-nums shrink-0" style={{ color: "var(--text-secondary)" }}>
                  {formatHour(a.startHour)}–{formatHour(a.endHour)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {a.poi.name}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}· {CATEGORY_LABELS[a.poi.category]} · {a.poi.distanceKm} km
                  </span>
                  <span className="ml-1 inline-flex items-center gap-1">
                    <SourceBadge status={a.poi.sourceStatus} />
                  </span>
                  <span className="block" style={{ color: "var(--text-secondary)" }}>
                    Horaires {formatHoursForDay(a.poi, dayIdx)}
                  </span>
                  {a.notes.map((n, j) => (
                    <span key={j} className="block" style={{ color: "var(--text-muted)" }}>
                      {n}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {plan.notes.map((n, i) => (
        <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {n}
        </p>
      ))}
    </div>
  );
}

function ConformityChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: ok ? "var(--badge-verified-bg)" : "var(--bg-surface)",
        color: ok ? "var(--badge-verified-text)" : "var(--text-muted)",
      }}
    >
      {ok ? "✓ " : "? "}
      {label}
    </span>
  );
}

export type { RankedPoi };
