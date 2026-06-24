/**
 * `SavedTripsList` — liste des voyages sauvegardés (`/voyages`).
 *
 * Charge tous les `SavedTrip` depuis IndexedDB, propose un filtre par statut
 * (Tous / Brouillons / Validés / Archivés), et expose les actions principales
 * sur chaque voyage : ouvrir dans `/plan?savedTripId=…`, renommer, archiver,
 * supprimer. Le bouton « Rafraîchir les dispos hôtel » n'est proposé qu'aux
 * voyages **promus au carnet** (un TripPlan existe).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  listSavedTrips,
  putSavedTrip,
  deleteSavedTrip,
  setActiveSavedTripId,
  getTrip,
  putLodgingSnapshot,
  clearLodgingSnapshots,
  listLodgingSnapshots,
} from "@/lib/db";
import type { SavedTrip, SavedTripStatus, LodgingSnapshot } from "@/lib/saved-trips/types";
import { refreshLodgingForPlan, snapshotAgeHours } from "@/lib/saved-trips/refresh-lodging";

type Filter = "all" | SavedTripStatus;

const STATUS_LABEL: Record<SavedTripStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  archived: "Archivé",
};

const STATUS_COLOR: Record<SavedTripStatus, string> = {
  draft: "var(--accent-info)",
  validated: "var(--accent-success)",
  archived: "var(--text-muted)",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function tripDates(trip: SavedTrip): string {
  if (trip.formState.mode === "planned") {
    const { dateFrom, dateTo } = trip.formState;
    if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
    return "Dates non renseignées";
  }
  const a = trip.formState.anchorStartDate;
  return a ? `Ancre le ${a}` : "Dates non renseignées";
}

interface FreshnessByTrip {
  [savedTripId: string]: { oldestHours: number | null; count: number };
}

export function SavedTripsList() {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<FreshnessByTrip>({});

  // Fetch IO pur (pas de setState) — séparé de l'effet pour respecter la
  // règle `react-hooks/set-state-in-effect` (qui interdit un setState
  // appelé de manière synchrone depuis un useEffect).
  async function fetchAll(): Promise<{
    trips: SavedTrip[];
    fresh: FreshnessByTrip;
  }> {
    const all = await listSavedTrips();
    const fresh: FreshnessByTrip = {};
    await Promise.all(
      all.map(async (t) => {
        const snaps = await listLodgingSnapshots(t.id);
        if (snaps.length === 0) {
          fresh[t.id] = { oldestHours: null, count: 0 };
          return;
        }
        const ages = snaps
          .map((s) => snapshotAgeHours(s))
          .filter((n): n is number => n !== null);
        fresh[t.id] = {
          oldestHours: ages.length > 0 ? Math.max(...ages) : null,
          count: snaps.length,
        };
      }),
    );
    return { trips: all, fresh };
  }

  useEffect(() => {
    let alive = true;
    fetchAll().then(({ trips, fresh }) => {
      if (!alive) return;
      setTrips(trips);
      setFreshness(fresh);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function reload() {
    const { trips, fresh } = await fetchAll();
    setTrips(trips);
    setFreshness(fresh);
  }

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3_000);
  }

  async function openTrip(trip: SavedTrip) {
    await setActiveSavedTripId(trip.id);
    router.push(`/plan?savedTripId=${encodeURIComponent(trip.id)}`);
  }

  async function renameTrip(trip: SavedTrip) {
    const next = window.prompt("Nouveau nom du voyage", trip.name);
    if (!next || next.trim().length === 0) return;
    await putSavedTrip({ ...trip, name: next.trim() });
    await reload();
    flash("Voyage renommé.");
  }

  async function setStatus(trip: SavedTrip, status: SavedTripStatus) {
    await putSavedTrip({ ...trip, status });
    await reload();
    flash(
      status === "archived"
        ? "Voyage archivé."
        : status === "draft"
          ? "Voyage réactivé."
          : "Voyage marqué validé.",
    );
  }

  async function removeTrip(trip: SavedTrip) {
    const ok = window.confirm(
      `Supprimer définitivement « ${trip.name} » ? Les snapshots de disponibilité hôtel associés seront aussi supprimés.`,
    );
    if (!ok) return;
    setBusyId(trip.id);
    try {
      await deleteSavedTrip(trip.id);
      await reload();
      flash("Voyage supprimé.");
    } finally {
      setBusyId(null);
    }
  }

  async function refreshLodging(trip: SavedTrip) {
    if (!trip.promotedTripPlanId) {
      flash(
        "Aucun voyage dans le carnet. Envoie d'abord le voyage au carnet pour générer les nuits à rafraîchir.",
      );
      return;
    }
    const plan = await getTrip(trip.promotedTripPlanId);
    if (!plan) {
      flash("Voyage promu introuvable dans le carnet (peut-être effacé).");
      return;
    }
    setBusyId(trip.id);
    try {
      await clearLodgingSnapshots(trip.id);
      const outcome = await refreshLodgingForPlan(plan, { savedTripId: trip.id });
      await Promise.all(
        outcome.snapshots.map((s: LodgingSnapshot) => putLodgingSnapshot(s)),
      );
      await reload();
      if (outcome.errors.length === 0) {
        flash(`${outcome.snapshots.length} nuit(s) rafraîchie(s).`);
      } else {
        flash(
          `${outcome.snapshots.length} OK · ${outcome.errors.length} erreur(s) — voir notes du carnet.`,
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  const visible = trips.filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-5">
      <FilterBar value={filter} onChange={setFilter} trips={trips} />

      {loading && (
        <p
          className="text-sm text-center py-8"
          style={{ color: "var(--text-secondary)" }}
        >
          Chargement…
        </p>
      )}

      {!loading && visible.length === 0 && (
        <EmptyState filter={filter} />
      )}

      {feedback && (
        <p
          className="text-sm"
          role="status"
          aria-live="polite"
          style={{ color: "var(--accent-success)" }}
        >
          {feedback}
        </p>
      )}

      <ul className="space-y-3" role="list">
        {visible.map((t) => (
          <li key={t.id}>
            <TripCard
              trip={t}
              busy={busyId === t.id}
              freshness={freshness[t.id]}
              onOpen={() => openTrip(t)}
              onRename={() => renameTrip(t)}
              onArchive={() => setStatus(t, "archived")}
              onUnarchive={() => setStatus(t, "draft")}
              onDelete={() => removeTrip(t)}
              onRefreshLodging={() => refreshLodging(t)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterBar({
  value,
  onChange,
  trips,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
  trips: SavedTrip[];
}) {
  const counts = {
    all: trips.length,
    draft: trips.filter((t) => t.status === "draft").length,
    validated: trips.filter((t) => t.status === "validated").length,
    archived: trips.filter((t) => t.status === "archived").length,
  };
  const options: { value: Filter; label: string }[] = [
    { value: "all", label: `Tous (${counts.all})` },
    { value: "draft", label: `Brouillons (${counts.draft})` },
    { value: "validated", label: `Validés (${counts.validated})` },
    { value: "archived", label: `Archivés (${counts.archived})` },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Filtrer les voyages"
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="rounded-full px-3 h-9 text-xs font-semibold"
            style={{
              background: active ? "var(--accent-amber)" : "var(--bg-surface)",
              color: active ? "var(--text-on-amber)" : "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const msg =
    filter === "all"
      ? "Aucun voyage enregistré. Crée-en un depuis « Planifier un voyage »."
      : filter === "draft"
        ? "Aucun brouillon. Les voyages en cours d'élaboration apparaissent ici."
        : filter === "validated"
          ? "Aucun voyage validé. « Envoie au carnet » un brouillon pour le valider."
          : "Aucun voyage archivé.";
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p
        className="text-sm max-w-md"
        style={{ color: "var(--text-secondary)" }}
      >
        {msg}
      </p>
      {filter === "all" && (
        <Link
          href="/plan"
          className="flex items-center justify-center h-11 px-6 rounded-xl font-semibold"
          style={{
            background: "var(--accent-amber)",
            color: "var(--text-on-amber)",
          }}
        >
          Planifier un voyage
        </Link>
      )}
    </div>
  );
}

function TripCard({
  trip,
  busy,
  freshness,
  onOpen,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
  onRefreshLodging,
}: {
  trip: SavedTrip;
  busy: boolean;
  freshness?: { oldestHours: number | null; count: number };
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onRefreshLodging: () => void;
}) {
  const modeLabel =
    trip.mode === "planned" ? "Voyage planifié" : "Voyage avec ancre";

  return (
    <article className="card p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5 min-w-0">
          <h2
            className="font-bold text-base truncate"
            style={{ color: "var(--text-primary)" }}
            title={trip.name}
          >
            {trip.name}
          </h2>
          <p
            className="text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {modeLabel} · {tripDates(trip)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Modifié le {fmtDate(trip.updatedAt)}
          </p>
        </div>
        <span
          className="text-xs font-bold rounded-full px-2 py-1 shrink-0"
          style={{
            background: "var(--bg-surface)",
            color: STATUS_COLOR[trip.status],
            border: `1px solid ${STATUS_COLOR[trip.status]}`,
          }}
        >
          {STATUS_LABEL[trip.status]}
        </span>
      </header>

      {trip.promotedTripPlanId && (
        <FreshnessLine freshness={freshness} />
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onOpen} disabled={busy}>
          Ouvrir
        </Button>
        <Button size="sm" variant="secondary" onClick={onRename} disabled={busy}>
          Renommer
        </Button>
        {trip.promotedTripPlanId && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefreshLodging}
            disabled={busy}
            loading={busy}
          >
            Rafraîchir les dispos hôtel
          </Button>
        )}
        {trip.status !== "archived" ? (
          <Button size="sm" variant="ghost" onClick={onArchive} disabled={busy}>
            Archiver
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onUnarchive} disabled={busy}>
            Désarchiver
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
          Supprimer
        </Button>
      </div>
    </article>
  );
}

function FreshnessLine({
  freshness,
}: {
  freshness?: { oldestHours: number | null; count: number };
}) {
  if (!freshness || freshness.count === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Dispos hôtel : jamais rafraîchies.
      </p>
    );
  }
  const h = freshness.oldestHours ?? 0;
  const stale = h > 24;
  const label =
    h < 1
      ? "à l'instant"
      : h < 24
        ? `il y a ${Math.round(h)} h`
        : `il y a ${Math.round(h / 24)} j`;
  return (
    <p
      className="text-xs"
      style={{ color: stale ? "var(--accent-warning)" : "var(--text-secondary)" }}
    >
      Dispos hôtel ({freshness.count}) : {label}
      {stale ? " — pense à rafraîchir" : ""}
    </p>
  );
}
