/**
 * `AnchoredTripForm` — formulaire du **Mode B — Voyage avec ancre**.
 *
 * Saisie : une **ancre** (événement à date et lieu fixes) + un point de
 * départ + une fenêtre (min/max nuits) + des étapes en chemin optionnelles.
 * Construit un `SynthesisRequest` complet et appelle `/api/synthesis`
 * (solveur déterministe S1–S7).
 *
 * Les contraintes (bébé, télétravail, canicule) sont dérivées du Profil Foyer.
 * Les étapes utilisateur deviennent des `Opportunity` à score élevé pour que
 * le solveur les retienne ; une date fixée se traduit en `timeWindow` restreint.
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
  // Une "étape" utilisateur = opportunity forcée (score 1) pour que le solveur
  // la retienne. La durée modélise approximativement "nights" — le solveur
  // n'a pas de concept natif de nuitées d'opportunity, mais une durée élevée
  // pousse à y consacrer une vraie journée.
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
  onResult: (result: {
    candidates: TripCandidate[];
    dateOptions: DateOption[];
  }) => void;
}

export function AnchoredTripForm({ onResult }: AnchoredTripFormProps) {
  const [anchorTitle, setAnchorTitle] = useState("");
  const [anchorCity, setAnchorCity] = useState("");
  const [anchorStartDate, setAnchorStartDate] = useState("");
  const [anchorStartTime, setAnchorStartTime] = useState("16:00");
  const [anchorEndTime, setAnchorEndTime] = useState("23:30");
  const [originCity, setOriginCity] = useState("");
  const [earliestStart, setEarliestStart] = useState("");
  const [latestEnd, setLatestEnd] = useState("");
  const [minNights, setMinNights] = useState(7);
  const [maxNights, setMaxNights] = useState(10);
  const [stops, setStops] = useState<PlanStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    anchorTitle.trim().length > 0 &&
    anchorCity.trim().length > 0 &&
    anchorStartDate.length === 10 &&
    originCity.trim().length > 0 &&
    earliestStart.length === 10 &&
    latestEnd.length === 10 &&
    earliestStart <= latestEnd &&
    minNights > 0 &&
    maxNights >= minNights;

  async function compose(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const anchorGeo = geocodeCity(anchorCity);
      if (!anchorGeo) throw new Error(`Ville inconnue pour l'ancre : ${anchorCity}`);
      const originGeo = geocodeCity(originCity);
      if (!originGeo) throw new Error(`Ville inconnue pour le départ : ${originCity}`);

      const profile = await loadActiveProfile();

      const anchor: Anchor = {
        id: `user-anchor-${slug(anchorTitle)}`,
        kind: "event",
        title: anchorTitle.trim(),
        location: { lat: anchorGeo.lat, lng: anchorGeo.lng },
        start: `${anchorStartDate}T${anchorStartTime}:00`,
        end: `${anchorStartDate}T${anchorEndTime}:00`,
        source: "saisie utilisateur",
        sourceStatus: "verified",
      };

      const opportunities: Opportunity[] = stops
        .map((s, i) => stopToOpportunity(s, i))
        .filter((o): o is Opportunity => o !== null);
      const unknownStops = stops
        .filter((s) => s.city.trim().length > 0)
        .filter((s) => !geocodeCity(s.city));

      const req: SynthesisRequest = {
        anchors: [anchor],
        opportunities,
        people: [],
        window: {
          origin: { lat: originGeo.lat, lng: originGeo.lng },
          earliestStart,
          latestEnd,
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
            value={anchorTitle}
            onChange={(e) => setAnchorTitle(e.target.value)}
            placeholder="ex. Mariage de Marie"
            className="h-11 px-3 rounded-lg w-full text-sm"
            style={inputStyle}
          />
        </label>
        <CityAutocomplete
          label="Ville"
          value={anchorCity}
          onChange={setAnchorCity}
          placeholder="ex. Marseille"
          required
        />
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 col-span-3 sm:col-span-1">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Date
            </span>
            <input
              type="date"
              required
              value={anchorStartDate}
              onChange={(e) => setAnchorStartDate(e.target.value)}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Heure début
            </span>
            <input
              type="time"
              required
              value={anchorStartTime}
              onChange={(e) => setAnchorStartTime(e.target.value)}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-on-card-warm)" }}
            >
              Heure fin
            </span>
            <input
              type="time"
              required
              value={anchorEndTime}
              onChange={(e) => setAnchorEndTime(e.target.value)}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      <CityAutocomplete
        label="Point de départ (domicile)"
        value={originCity}
        onChange={setOriginCity}
        placeholder="ex. Paris"
        required
      />

      <section className="space-y-3">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Durée du voyage
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Au plus tôt
            </span>
            <input
              type="date"
              required
              value={earliestStart}
              onChange={(e) => setEarliestStart(e.target.value)}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Au plus tard
            </span>
            <input
              type="date"
              required
              value={latestEnd}
              onChange={(e) => setLatestEnd(e.target.value)}
              min={earliestStart || undefined}
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Min. nuits
            </span>
            <input
              type="number"
              min={1}
              max={60}
              value={minNights}
              onChange={(e) =>
                setMinNights(Math.max(1, Number(e.target.value) || 1))
              }
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Max. nuits
            </span>
            <input
              type="number"
              min={1}
              max={60}
              value={maxNights}
              onChange={(e) =>
                setMaxNights(Math.max(1, Number(e.target.value) || 1))
              }
              className="h-11 px-3 rounded-lg w-full text-sm"
              style={inputStyle}
            />
          </label>
        </div>
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
          stops={stops}
          onChange={setStops}
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
        Composer mes voyages
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
