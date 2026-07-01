"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import {
  getLatestTrip,
  getLodgingSelections,
  saveLodgingSelection,
  listReservations,
  loadActiveProfile,
  clearCarnet,
  listSavedTrips,
  getSavedTrip,
  putLodgingSnapshot,
  clearLodgingSnapshots,
  listLodgingSnapshots,
} from "@/lib/db";
import {
  refreshLodgingForPlan,
  snapshotAgeHours,
} from "@/lib/saved-trips/refresh-lodging";
import type { LodgingSnapshot } from "@/lib/saved-trips/types";
import { buildDebugTrace, debugTraceFilename } from "@/lib/saved-trips/debug-trace";
import { isDebugMode, subscribeDebugMode } from "@/lib/debug/debug-mode";
import type { TripPlan, DayPlan, FamilyProfile } from "@/types";
import type { Reservation } from "@/lib/reservations/reservation-types";
import { WorkationTracks } from "@/components/workation/WorkationTracks";
import { DayPlanSkeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LodgingPanel } from "@/components/lodging/LodgingPanel";
import { ReservationsForDay } from "@/components/reservations/ReservationsForDay";
import { exportTripAsJson, shareTripUrl, decodeTripFromUrl } from "@/lib/export";
import { buildIcs, tripPlanToEvents, reservationsToEvents } from "@/lib/calendar/ics";

/** Réservations couvrant une date (début ≤ date ≤ fin, ou début = date). */
function reservationsOnDate(reservations: Reservation[], date: string): Reservation[] {
  return reservations.filter((r) => {
    const end = r.endDate ?? r.startDate;
    return r.startDate <= date && date <= end;
  });
}

export function RoadbookClient() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profile, setProfile] = useState<FamilyProfile | null>(null);
  /** Voyage sauvegardé promu vers ce TripPlan (sert au refresh dispos). */
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  /** Snapshots de dispos hôtel par date (clé = date du jour). */
  const [snapshotsByDate, setSnapshotsByDate] = useState<Record<string, LodgingSnapshot>>({});
  const [refreshing, setRefreshing] = useState(false);

  const debugEnabled = useSyncExternalStore(
    subscribeDebugMode,
    isDebugMode,
    () => false,
  );

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // Lien partagé : /carnet?trip=<lz-string>. On décode le voyage **depuis
        // l'URL** (aucune dépendance à l'IndexedDB local → fonctionne sur un autre
        // appareil / navigateur). Sinon, on charge le dernier voyage local.
        const encoded =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("trip")
            : null;
        const shared = encoded ? decodeTripFromUrl(encoded) : null;

        const trip = shared ?? (await getLatestTrip());
        if (!mounted) return;
        setPlan(trip);
        // Sélections / SavedTrip promu / snapshots ne concernent qu'un voyage
        // **local** (un voyage partagé n'existe pas dans l'IndexedDB de ce poste).
        if (trip && !shared) {
          const sel = await getLodgingSelections(trip.id);
          setSelections(sel);
          // Cherche le SavedTrip promu sur ce TripPlan (le plus récent).
          const saved = await listSavedTrips();
          const linked = saved.find((s) => s.promotedTripPlanId === trip.id);
          if (mounted && linked) {
            setSavedTripId(linked.id);
            const snaps = await listLodgingSnapshots(linked.id);
            if (mounted) {
              setSnapshotsByDate(
                Object.fromEntries(snaps.map((s) => [s.date, s])),
              );
            }
          }
        }
        const res = await listReservations();
        if (mounted) setReservations(res);
        const prof = await loadActiveProfile();
        if (mounted) setProfile(prof);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  async function selectLodging(date: string, lodgingId: string) {
    if (!plan) return;
    await saveLodgingSelection(plan.id, date, lodgingId);
    setSelections((prev) => ({ ...prev, [date]: lodgingId }));
  }

  async function handleExportJson() {
    if (!plan) return;
    exportTripAsJson(plan);
    setExportMsg("Fichier exporté !");
    setTimeout(() => setExportMsg(null), 3000);
  }

  async function handleShare() {
    if (!plan) return;
    const url = shareTripUrl(plan);
    await navigator.clipboard.writeText(url).catch(() => {});
    setExportMsg("Lien copié dans le presse-papiers !");
    setTimeout(() => setExportMsg(null), 3000);
  }

  function handleExportIcs() {
    if (!plan) return;
    const events = [...tripPlanToEvents(plan), ...reservationsToEvents(reservations)];
    const ics = buildIcs(events);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "odyssee-voyage.ics";
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg("Calendrier .ics exporté !");
    setTimeout(() => setExportMsg(null), 3000);
  }

  async function handleRefreshLodging() {
    if (!plan) return;
    if (!savedTripId) {
      setExportMsg("Voyage non associé à une sauvegarde — rouvrez-le depuis /voyages.");
      setTimeout(() => setExportMsg(null), 4000);
      return;
    }
    setRefreshing(true);
    try {
      await clearLodgingSnapshots(savedTripId);
      const outcome = await refreshLodgingForPlan(plan, { savedTripId });
      await Promise.all(outcome.snapshots.map((s) => putLodgingSnapshot(s)));
      setSnapshotsByDate(
        Object.fromEntries(outcome.snapshots.map((s) => [s.date, s])),
      );
      if (outcome.errors.length === 0) {
        setExportMsg(`${outcome.snapshots.length} nuit(s) rafraîchie(s).`);
      } else {
        setExportMsg(
          `${outcome.snapshots.length} OK · ${outcome.errors.length} erreur(s).`,
        );
      }
      setTimeout(() => setExportMsg(null), 3000);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDownloadDebug() {
    if (!plan || !profile) return;
    // Le voyage sauvegardé lié porte la saisie + les candidats/brouillon.
    const savedTrip = savedTripId ? await getSavedTrip(savedTripId) : null;
    if (!savedTrip) {
      setExportMsg(
        "Journal indisponible : ce carnet n'est pas lié à un voyage sauvegardé. Recomposez-le depuis /plan.",
      );
      setTimeout(() => setExportMsg(null), 5000);
      return;
    }
    const generatedAt = new Date().toISOString();
    const trace = buildDebugTrace({
      savedTrip,
      tripPlan: plan,
      profile,
      lodgingSnapshots: Object.values(snapshotsByDate),
      appMode: process.env.NEXT_PUBLIC_APP_MODE ?? "mock",
      generatedAt,
    });
    const blob = new Blob([JSON.stringify(trace, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = debugTraceFilename(savedTrip, generatedAt);
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg(
      trace.warnings.length > 0
        ? `Journal téléchargé (${trace.warnings.length} avertissement(s) inclus).`
        : "Journal de debug téléchargé.",
    );
    setTimeout(() => setExportMsg(null), 4000);
  }

  async function handleClear() {
    if (!plan) return;
    const ok = window.confirm(
      "Effacer le carnet ? Le voyage en cours et les sélections d'hébergement seront supprimés du navigateur. Le Profil Foyer et les autres données (budget, bagages, réservations) sont conservés."
    );
    if (!ok) return;
    await clearCarnet();
    setPlan(null);
    setSelections({});
    setSnapshotsByDate({});
    setSavedTripId(null);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <RoadbookHeader loading />
        <DayPlanSkeleton />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "var(--bg-surface)" }}
          aria-hidden="true"
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 8v8M16 22h.01" stroke="var(--accent-amber)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Aucun voyage dans le carnet
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Planifiez un voyage pour démarrer.
          </p>
        </div>
        <a
          href="/plan"
          className="flex items-center justify-center h-12 px-8 rounded-xl font-semibold"
          style={{ background: "var(--accent-amber)", color: "var(--text-on-amber)" }}
        >
          Planifier un voyage
        </a>
      </div>
    );
  }

  const totalBudget = Object.entries(selections).reduce((acc, [date, lodgingId]) => {
    const day = plan.days.find((d) => d.date === date);
    const lodging = day?.lodging;
    if (lodging?.id === lodgingId) return acc + lodging.priceTotal;
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      <RoadbookHeader plan={plan} />

      {/* Export buttons */}
      <div className="flex flex-wrap gap-3 no-print">
        <Button variant="secondary" size="sm" onClick={handleExportJson}>
          Exporter JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={handleShare}>
          Partager
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportIcs}>
          Calendrier .ics
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          Imprimer
        </Button>
        {savedTripId && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshLodging}
            loading={refreshing}
            disabled={refreshing}
          >
            Rafraîchir les dispos hôtel
          </Button>
        )}
        {debugEnabled && (
          <Button variant="ghost" size="sm" onClick={handleDownloadDebug}>
            Télécharger le journal de debug
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Effacer le carnet
        </Button>
        {exportMsg && (
          <span className="text-xs flex items-center" style={{ color: "var(--accent-success)" }}>
            {exportMsg}
          </span>
        )}
      </div>

      <LiveLodgingFreshness snapshots={snapshotsByDate} savedTripId={savedTripId} />


      {/* Budget summary */}
      {Object.keys(selections).length > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Budget hébergement sélectionné
          </span>
          <span className="font-bold" style={{ color: "var(--accent-amber)" }}>
            {totalBudget.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      {/* Conflicts */}
      {plan.conflicts.length > 0 && (
        <div
          className="card p-4 space-y-2"
          role="alert"
          style={{ borderColor: "var(--accent-danger)" }}
        >
          <p className="font-semibold text-sm" style={{ color: "var(--accent-danger)" }}>
            Points d&apos;attention
          </p>
          {plan.conflicts.map((c, i) => (
            <p key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>{c}</p>
          ))}
        </div>
      )}

      {/* Day-by-day plan */}
      <div className="space-y-3">
        {plan.days.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            selectedLodgingId={selections[day.date]}
            isActive={activeDay === day.date}
            onToggle={() => setActiveDay(activeDay === day.date ? null : day.date)}
            onSelectLodging={(id) => selectLodging(day.date, id)}
            reservations={reservationsOnDate(reservations, day.date)}
            profile={profile}
            lodgingSnapshot={snapshotsByDate[day.date]}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Bandeau condensé indiquant l'âge des snapshots de dispos hôtel.
 * Suggère de rafraîchir au-delà de 24h.
 */
function LiveLodgingFreshness({
  snapshots,
  savedTripId,
}: {
  snapshots: Record<string, LodgingSnapshot>;
  savedTripId: string | null;
}) {
  if (!savedTripId) return null;
  const entries = Object.values(snapshots);
  if (entries.length === 0) {
    return (
      <p
        className="text-xs no-print"
        style={{ color: "var(--text-muted)" }}
      >
        Dispos hôtel : jamais rafraîchies pour ce voyage. Utilisez « Rafraîchir les dispos hôtel » pour interroger le fournisseur.
      </p>
    );
  }
  const ages = entries
    .map((s) => snapshotAgeHours(s))
    .filter((n): n is number => n !== null);
  const max = ages.length > 0 ? Math.max(...ages) : 0;
  const stale = max > 24;
  const ageLabel =
    max < 1 ? "à l'instant" : max < 24 ? `il y a ${Math.round(max)} h` : `il y a ${Math.round(max / 24)} j`;
  const source =
    entries.length > 0 ? entries[0].result.sourceName : "mock";
  return (
    <p
      className="text-xs no-print"
      style={{ color: stale ? "var(--accent-warning)" : "var(--text-secondary)" }}
    >
      Dispos hôtel ({entries.length} nuit{entries.length > 1 ? "s" : ""}) ·
      source : {source} · {ageLabel}
      {stale ? " — pense à rafraîchir" : ""}
    </p>
  );
}

function RoadbookHeader({ plan, loading }: { plan?: TripPlan | null; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-48" />
      </div>
    );
  }
  if (!plan) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Carnet de route
        </h1>
        <Badge variant={plan.feasible ? "success" : "danger"}>
          {plan.feasible ? "Faisable" : "Conflits détectés"}
        </Badge>
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {plan.days.length} jours · {plan.totalDistanceKm.toLocaleString()} km · {Math.round(plan.totalDrivingMinutes / 60)}h de conduite
      </p>
    </div>
  );
}

function DayCard({
  day,
  selectedLodgingId,
  isActive,
  onToggle,
  onSelectLodging,
  reservations,
  profile,
  lodgingSnapshot,
}: {
  day: DayPlan;
  selectedLodgingId?: string;
  isActive: boolean;
  onToggle: () => void;
  onSelectLodging: (id: string) => void;
  reservations: Reservation[];
  profile: FamilyProfile | null;
  lodgingSnapshot?: LodgingSnapshot;
}) {
  const date = new Date(day.date);
  const dayStr = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const typeConfig = DAY_TYPE_CONFIG[day.type] ?? DAY_TYPE_CONFIG.rest;

  return (
    <article className="card overflow-hidden">
      <button
        className="w-full flex items-start gap-4 p-4 text-left hover:opacity-80 transition-opacity"
        onClick={onToggle}
        aria-expanded={isActive}
        aria-label={`${dayStr} — ${day.location} (${typeConfig.label})`}
      >
        {/* Date column */}
        <div className="w-20 shrink-0">
          <p className="text-xs font-semibold" style={{ color: typeConfig.color }}>
            {typeConfig.label}
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {dayStr}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            {day.location}
          </p>
          {day.leg && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {day.leg.distanceKm} km · {Math.round(day.leg.durationMinutes / 60)}h
              {day.leg.chargeStops.length > 0 && ` · ${day.leg.chargeStops.length} recharge${day.leg.chargeStops.length > 1 ? "s" : ""}`}
            </p>
          )}
          {day.heatAdvisory && (
            <p className="text-xs mt-0.5" style={{ color: "var(--accent-warning)" }}>
              Vigilance canicule
            </p>
          )}
        </div>

        {/* Expand icon */}
        <span
          className="text-lg transition-transform"
          style={{
            color: "var(--text-secondary)",
            transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        >
          ˅
        </span>
      </button>

      {/* Expanded content */}
      {isActive && (
        <div className="border-t px-4 pb-4 space-y-4" style={{ borderColor: "var(--border-subtle)" }}>
          {/* Orchestration jour de télétravail (R4) — coworking + plan famille */}
          {profile && day.lodging && (
            <div className="pt-3">
              <WorkationTracks
                lodging={{ lat: day.lodging.lat, lng: day.lodging.lng }}
                date={day.date}
                workDays={profile.work.workDays}
                workWindow={[profile.work.workStartHour, profile.work.workEndHour]}
                heatAlert={day.heatAdvisory}
              />
            </div>
          )}

          {/* Notes */}
          {day.notes.length > 0 && (
            <ul className="text-sm space-y-1 pt-3" style={{ color: "var(--text-secondary)" }}>
              {day.notes.map((note, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: "var(--accent-amber)" }} aria-hidden="true">–</span>
                  {note}
                </li>
              ))}
            </ul>
          )}

          {/* Charge stops */}
          {day.leg && day.leg.chargeStops.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Recharges
              </p>
              {day.leg.chargeStops.map((stop, i) => (
                <div key={i} className="text-sm flex items-center gap-3" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent-amber)" }} aria-hidden="true">⚡</span>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {stop.superchargerName}
                  </span>
                  <span>
                    {Math.round(stop.socOnArrival * 100)}% → {Math.round(stop.socOnDeparture * 100)}%
                  </span>
                  <span>{stop.chargeMinutes} min</span>
                </div>
              ))}
            </div>
          )}

          {/* Connectivity */}
          {day.connectivity && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>5G SFR</span>
              <span style={{ color: connectivityColor(day.connectivity.quality) }}>
                {CONNECTIVITY_LABELS[day.connectivity.quality]}
              </span>
              {day.connectivity.note && (
                <span style={{ color: "var(--text-secondary)" }}>— {day.connectivity.note}</span>
              )}
            </div>
          )}

          {/* Réservations importées (M8) */}
          {reservations.length > 0 && <ReservationsForDay reservations={reservations} />}

          {/* Lodging panel (hébergement seed/estimated du orchestrator) */}
          {day.lodging && (
            <LodgingPanel
              day={day}
              selectedId={selectedLodgingId}
              onSelect={onSelectLodging}
            />
          )}

          {/* Dispos hôtel temps réel (rafraîchies à la demande) */}
          {lodgingSnapshot && <LiveLodgingOffers snapshot={lodgingSnapshot} />}

          {/* Events */}
          {day.events && day.events.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Événements
              </p>
              {day.events.map((event) => (
                <div key={event.id} className="text-sm" style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold">{event.name}</span>
                  {" — "}
                  {Math.floor(event.hour)}h{String(Math.round((event.hour % 1) * 60)).padStart(2, "0")}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {event.location.address}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

const DAY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  drive: { label: "Trajet", color: "var(--accent-amber)" },
  work: { label: "Télétravail", color: "var(--accent-info)" },
  rest: { label: "Repos / Visite", color: "var(--accent-vine-light)" },
  event: { label: "Événement", color: "var(--accent-success)" },
  "charge-only": { label: "Recharge", color: "var(--accent-amber)" },
};

const CONNECTIVITY_LABELS: Record<string, string> = {
  excellent: "Excellente",
  good: "Bonne",
  fair: "Correcte",
  poor: "Insuffisante",
};

function connectivityColor(quality: string): string {
  const map: Record<string, string> = {
    excellent: "var(--accent-success)",
    good: "var(--accent-success)",
    fair: "var(--accent-warning)",
    poor: "var(--accent-danger)",
  };
  return map[quality] ?? "var(--text-secondary)";
}

/**
 * Volet « Dispos temps réel » dans une journée :
 * - liste compacte des offres du snapshot (3 premières + indicateur "+N")
 * - source affichée (mock / LiteAPI / Hotelbeds Test)
 * - fraîcheur explicite (`readAt` formaté)
 * - aucune action de réservation
 */
function LiveLodgingOffers({ snapshot }: { snapshot: LodgingSnapshot }) {
  // Offres typées de façon défensive : on tolère des shapes différents selon
  // le fournisseur (mock vs LiteAPI vs Hotelbeds) — on lit uniquement les
  // champs minimums utiles à l'affichage.
  type RawOffer = {
    id?: string;
    name?: string;
    available?: boolean;
    priceTotalCents?: number | null;
    sourceName?: string;
  };
  const offers = (snapshot.result.offers as RawOffer[]) ?? [];
  const visible = offers.slice(0, 3);
  const remaining = Math.max(0, offers.length - visible.length);

  const readAt = new Date(snapshot.readAt).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        background: "var(--bg-base)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Dispos hôtel — temps réel
        </p>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {snapshot.result.sourceName} · {readAt}
        </span>
      </div>

      {offers.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Aucune offre renvoyée pour cette nuit.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((o, i) => (
            <li key={o.id ?? i} className="flex items-center justify-between gap-2 text-sm">
              <span style={{ color: "var(--text-primary)" }}>
                {o.name ?? "Hôtel"}
              </span>
              <span
                className="text-xs font-medium shrink-0"
                style={{
                  color: o.available
                    ? "var(--accent-amber)"
                    : "var(--text-muted)",
                }}
              >
                {o.available && o.priceTotalCents != null
                  ? `${Math.round((o.priceTotalCents ?? 0) / 100)} €`
                  : "Complet"}
              </span>
            </li>
          ))}
          {remaining > 0 && (
            <li
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              +{remaining} autre{remaining > 1 ? "s" : ""} offre{remaining > 1 ? "s" : ""}
            </li>
          )}
        </ul>
      )}

      {snapshot.result.notes.length > 0 && (
        <ul className="text-xs space-y-0.5" style={{ color: "var(--text-muted)" }}>
          {snapshot.result.notes.map((n, i) => (
            <li key={i}>— {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
