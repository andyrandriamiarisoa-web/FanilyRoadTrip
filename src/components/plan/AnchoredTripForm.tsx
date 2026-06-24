/**
 * `AnchoredTripForm` — formulaire du **Mode B — Voyage avec ancre**.
 *
 * Le state du formulaire est piloté depuis `PlanWizard` (édition d'un voyage
 * sauvegardé possible). Construit un `SynthesisRequest` et appelle
 * `/api/synthesis` (solveur déterministe S1–S7). Les contraintes (bébé,
 * télétravail, canicule) viennent du Profil Foyer.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadActiveProfile } from "@/lib/db";
import { geocodeCity } from "@/lib/routing/geocode";
import type {
  Anchor,
  HouseholdConstraints,
  Opportunity,
  SynthesisRequest,
  TripCandidate,
} from "@/lib/synthesis/types";
import type { DateOption } from "@/lib/synthesis/date-flex";
import type { FamilyProfile } from "@/types";
import type { AnchoredFormState, TripIntent } from "@/lib/saved-trips/types";
import { nightsFromIntent } from "@/lib/saved-trips/types";
import { CityAutocomplete } from "./CityAutocomplete";
import { StopList, type PlanStop } from "./StopList";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const WEEKDAY_TO_NUM: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function hhmm(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function constraintsFromProfile(p: FamilyProfile): HouseholdConstraints {
  return {
    babyPauseEveryMin: p.baby.maxLegMinutes,
    babyPauseDurationMin: 15,
    maxDrivePerDayMin: 300,
    workDays: p.work.workDays
      .map((d) => WEEKDAY_TO_NUM[d])
      .filter((n): n is number => typeof n === "number"),
    workStart: hhmm(p.work.workStartHour),
    workEnd: hhmm(p.work.workEndHour),
    caniculeNoDrive: {
      start: hhmm(p.driving.noHeatDrivingRange[0]),
      end: hhmm(p.driving.noHeatDrivingRange[1]),
    },
  };
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stopToOpportunity(stop: PlanStop, index: number): Opportunity | null {
  const geo = geocodeCity(stop.city);
  if (!geo) return null;
  const nights = Math.max(0, stop.nights);
  const durationMin = Math.max(120, nights * 240 + 120);
  return {
    id: `user-stop-${index}-${slug(stop.city)}`,
    title: `${stop.city} (étape souhaitée${nights > 0 ? ` · ${nights} nuit${nights > 1 ? "s" : ""}` : ""})`,
    category: "attraction",
    location: { lat: geo.lat, lng: geo.lng },
    score: 1,
    durationMin,
    timeWindow: stop.fixedDate
      ? { start: stop.fixedDate, end: stop.fixedDate }
      : undefined,
    indoor: false,
    babyFriendly: true,
    source: "saisie utilisateur",
    sourceStatus: "verified",
  };
}

interface AnchoredTripFormProps {
  value: AnchoredFormState;
  onChange: (next: AnchoredFormState) => void;
  onResult: (result: {
    candidates: TripCandidate[];
    dateOptions: DateOption[];
  }) => void;
  hasExisting: boolean;
}

export function AnchoredTripForm({
  value,
  onChange,
  onResult,
  hasExisting,
}: AnchoredTripFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<AnchoredFormState>) {
    onChange({ ...value, ...p });
  }

  // anchorEndDate par défaut = anchorStartDate (événement ponctuel).
  const effectiveAnchorEnd =
    value.anchorEndDate && value.anchorEndDate.length === 10
      ? value.anchorEndDate
      : value.anchorStartDate;

  const ready =
    value.anchorTitle.trim().length > 0 &&
    value.anchorCity.trim().length > 0 &&
    value.anchorStartDate.length === 10 &&
    effectiveAnchorEnd >= value.anchorStartDate &&
    value.originCity.trim().length > 0 &&
    value.earliestStart.length === 10 &&
    value.latestEnd.length === 10 &&
    value.earliestStart <= value.latestEnd;

  async function compose(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const anchorGeo = geocodeCity(value.anchorCity);
      if (!anchorGeo) throw new Error(`Ville inconnue pour l'ancre : ${value.anchorCity}`);
      const originGeo = geocodeCity(value.originCity);
      if (!originGeo) throw new Error(`Ville inconnue pour le départ : ${value.originCity}`);

      const profile = await loadActiveProfile();

      const anchor: Anchor = {
        id: `user-anchor-${slug(value.anchorTitle)}`,
        kind: "event",
        title: value.anchorTitle.trim(),
        location: { lat: anchorGeo.lat, lng: anchorGeo.lng },
        start: `${value.anchorStartDate}T${value.anchorStartTime}:00`,
        // Pour un séjour multi-jour, la fin est sur `effectiveAnchorEnd` ;
        // sinon (événement ponctuel), même date. Le solveur détecte
        // automatiquement la durée < 24h pour rester en mono-jour.
        end: `${effectiveAnchorEnd}T${value.anchorEndTime}:00`,
        source: "saisie utilisateur",
        sourceStatus: "verified",
      };

      // Calcule les bornes de nuits depuis l'intention choisie.
      const { minNights, maxNights } = nightsFromIntent({
        intent: value.intent,
        earliestStart: value.earliestStart,
        latestEnd: value.latestEnd,
        anchorStartDate: value.anchorStartDate,
        anchorEndDate: effectiveAnchorEnd,
        minNights: value.minNights,
        maxNights: value.maxNights,
      });

      const opportunities: Opportunity[] = value.stops
        .map((s, i) => stopToOpportunity(s, i))
        .filter((o): o is Opportunity => o !== null);
      const unknownStops = value.stops
        .filter((s) => s.city.trim().length > 0)
        .filter((s) => !geocodeCity(s.city));

      const req: SynthesisRequest = {
        anchors: [anchor],
        opportunities,
        people: [],
        window: {
          origin: { lat: originGeo.lat, lng: originGeo.lng },
          earliestStart: value.earliestStart,
          latestEnd: value.latestEnd,
          minNights,
          maxNights,
        },
        constraints: constraintsFromProfile(profile),
      };

      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de synthèse");
      onResult({
        candidates: (data.candidates ?? []) as TripCandidate[],
        dateOptions: (data.dateOptions ?? []) as DateOption[],
      });
      if (unknownStops.length > 0) {
        setError(
          `Étape(s) ignorée(s) (ville inconnue de la table seed) : ${unknownStops.map((s) => s.city).join(", ")}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de composition");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card p-5 space-y-5" onSubmit={compose}>
      <header>
        <h2
          className="font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Voyage avec ancre
        </h2>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Renseignez l’événement à date fixe ; l’app calcule les dates de départ et de retour.
        </p>
      </header>

      <section
        className="card-warm p-4 space-y-3"
        aria-label="Ancre du voyage"
      >
        <p
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          Ancre du voyage
        </p>
        <label className="flex flex-col gap-1.5">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-on-card-warm)" }}
          >
            Intitulé
          </span>
          <input
            type="text"
            required
            value={value.anchorTitle}
            onChange={(e) => patch({ anchorTitle: e.target.value })}
            placeholder="ex. Mariage de Marie"
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </label>
        <CityAutocomplete
          label="Ville"
          value={value.anchorCity}
          onChange={(v) => patch({ anchorCity: v })}
          placeholder="ex. Marseille"
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Du
            </span>
            <input
              type="date"
              required
              value={value.anchorStartDate}
              onChange={(e) => {
                const next = e.target.value;
                // Si la date de fin est antérieure à la nouvelle date de
                // début, on la recale automatiquement.
                const nextEnd =
                  value.anchorEndDate && value.anchorEndDate >= next
                    ? value.anchorEndDate
                    : next;
                patch({ anchorStartDate: next, anchorEndDate: nextEnd });
              }}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Au
            </span>
            <input
              type="date"
              required
              value={effectiveAnchorEnd}
              min={value.anchorStartDate || undefined}
              onChange={(e) => patch({ anchorEndDate: e.target.value })}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Heure de début (1er jour)
            </span>
            <input
              type="time"
              required
              value={value.anchorStartTime}
              onChange={(e) => patch({ anchorStartTime: e.target.value })}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Heure de fin (dernier jour)
            </span>
            <input
              type="time"
              required
              value={value.anchorEndTime}
              onChange={(e) => patch({ anchorEndTime: e.target.value })}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
        <p
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Mariage, RDV, concert : laisse <em>Du = Au</em> (1 journée). Séjour,
          séminaire ou conférence : étire <em>Au</em> jusqu&apos;au dernier jour. Le
          foyer reste sur place pendant tout le bloc — pas de route.
        </p>
      </section>

      <CityAutocomplete
        label="Point de départ (domicile)"
        value={value.originCity}
        onChange={(v) => patch({ originCity: v })}
        placeholder="ex. Paris"
        required
      />

      <section className="space-y-3">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Fenêtre du voyage
        </h3>
        <p
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          À partir de quand peux-tu partir, et jusqu&apos;à quand dois-tu être rentré ?
          Le solveur explore plusieurs dates de départ et de retour dans cette
          fenêtre.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Partir au plus tôt le
            </span>
            <input
              type="date"
              required
              value={value.earliestStart}
              onChange={(e) => patch({ earliestStart: e.target.value })}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Rentré au plus tard le
            </span>
            <input
              type="date"
              required
              value={value.latestEnd}
              onChange={(e) => patch({ latestEnd: e.target.value })}
              min={value.earliestStart || undefined}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
        <IntentSelector
          value={value.intent}
          onChange={(intent) => patch({ intent })}
        />
        {value.intent === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="flex flex-col gap-1.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Au moins
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={value.minNights}
                onChange={(e) =>
                  patch({ minNights: Math.max(1, Number(e.target.value) || 1) })
                }
                className="h-11 px-3 rounded-lg w-full text-sm"
                style={inputStyle}
              />
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                nuits
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Au plus
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={value.maxNights}
                onChange={(e) =>
                  patch({ maxNights: Math.max(1, Number(e.target.value) || 1) })
                }
                className="h-11 px-3 rounded-lg w-full text-sm"
                style={inputStyle}
              />
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                nuits
              </span>
            </label>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Étapes en chemin
        </h3>
        <p
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Optionnel. Chaque étape sera prise en compte par le solveur ; une date fixée la place sur ce jour précis.
        </p>
        <StopList
          stops={value.stops}
          onChange={(stops) => patch({ stops })}
          addLabel="Ajouter une étape"
          emptyHint="Aucune étape — le solveur composera librement le chemin entre votre domicile et l'ancre."
        />
        <p
          className="text-xs italic"
          style={{ color: "var(--text-muted)" }}
        >
          Note : la durée demandée est un indice ; le solveur l’honore au mieux dans la fenêtre du voyage.
        </p>
      </section>

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={loading || !ready}
        className="w-full"
      >
        {hasExisting ? "Recomposer mes voyages" : "Composer mes voyages"}
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

/** State initial vierge pour un nouveau voyage avec ancre. */
export function emptyAnchoredFormState(): AnchoredFormState {
  return {
    mode: "anchored",
    anchorTitle: "",
    anchorCity: "",
    anchorStartDate: "",
    anchorEndDate: "",
    anchorStartTime: "16:00",
    anchorEndTime: "23:30",
    originCity: "",
    earliestStart: "",
    latestEnd: "",
    intent: "maximize",
    minNights: 7,
    maxNights: 10,
    stops: [],
  };
}

// ── IntentSelector ──────────────────────────────────────────────────────────

const INTENT_OPTIONS: { value: TripIntent; title: string; description: string }[] = [
  {
    value: "maximize",
    title: "Maximiser le temps de voyage",
    description:
      "Le solveur prend toute la fenêtre disponible, sous tes contraintes (bébé, télétravail, canicule).",
  },
  {
    value: "fastest",
    title: "Au plus rapide",
    description:
      "Aller-retour minimum pour honorer l'ancre. Le solveur ramène le voyage au strict nécessaire.",
  },
  {
    value: "custom",
    title: "Sur mesure",
    description:
      "Tu fixes une fourchette de nuits (min/max). Utile pour caler sur un nombre précis de jours.",
  },
];

function IntentSelector({
  value,
  onChange,
}: {
  value: TripIntent;
  onChange: (next: TripIntent) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Choisir une intention de voyage"
      className="space-y-2"
    >
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        Combien de temps tu veux voyager ?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {INTENT_OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className="text-left rounded-lg p-3 min-h-[44px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: active ? "var(--bg-surface)" : "var(--bg-base)",
                border: `2px solid ${
                  active ? "var(--accent-amber)" : "var(--border-default)"
                }`,
                outlineColor: "var(--accent-amber)",
              }}
            >
              <p
                className="font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {opt.title}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
