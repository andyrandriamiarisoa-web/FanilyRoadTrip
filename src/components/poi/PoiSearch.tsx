"use client";

import { useMemo, useState } from "react";
import { poisInCity, haversineKm, formatHoursForDay, isoWeekday } from "@/lib/poi/poi";
import { SourceBadge } from "@/components/ui/Badge";
import type { Poi, PoiCategory } from "@/types";

/** Villes d'étape couvertes par le seed POI (centre approximatif). */
const CITIES: { key: string; label: string; lat: number; lng: number }[] = [
  { key: "dijon", label: "Dijon", lat: 47.32, lng: 5.04 },
  { key: "beaune", label: "Beaune", lat: 47.02, lng: 4.84 },
  { key: "macon", label: "Mâcon", lat: 46.31, lng: 4.83 },
  { key: "lyon", label: "Lyon", lat: 45.75, lng: 4.84 },
  { key: "tain-l-hermitage", label: "Tain-l'Hermitage", lat: 45.07, lng: 4.84 },
  { key: "montelimar", label: "Montélimar", lat: 44.56, lng: 4.75 },
  { key: "marseille", label: "Marseille", lat: 43.30, lng: 5.37 },
  { key: "sens", label: "Sens", lat: 48.20, lng: 3.28 },
];

const CATEGORIES: { value: PoiCategory; label: string }[] = [
  { value: "coworking", label: "Coworking" },
  { value: "museum", label: "Musées" },
  { value: "aquarium-zoo", label: "Aquarium / Zoo" },
  { value: "attraction", label: "Visites" },
  { value: "park", label: "Parcs" },
  { value: "playground", label: "Aires de jeux" },
  { value: "family-restaurant", label: "Restaurants famille" },
];

const ALL_CATEGORIES = CATEGORIES.map((c) => c.value);

/**
 * Recherche de lieux & horaires sur **données ouvertes** (Lot R3), servies
 * hors-ligne depuis le seed POI (R2). On **classe par proximité sans exclure**
 * (anti-pattern #1) ; les horaires sont affichés quand connus, la source est
 * toujours indiquée (anti-pattern #3).
 */
export function PoiSearch() {
  const [cityKey, setCityKey] = useState(CITIES[0].key);
  const [categories, setCategories] = useState<Set<PoiCategory>>(new Set(ALL_CATEGORIES));

  const city = CITIES.find((c) => c.key === cityKey) ?? CITIES[0];
  const today = isoWeekday(new Date());

  const results = useMemo(() => {
    const selected = categories.size > 0 ? [...categories] : ALL_CATEGORIES;
    return poisInCity(city.label, selected)
      .map((p) => ({ poi: p, distanceKm: round1(haversineKm(city, p)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm || a.poi.id.localeCompare(b.poi.id));
  }, [city, categories]);

  function toggleCategory(cat: PoiCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Sélecteur de ville */}
      <div>
        <label htmlFor="poi-city" className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Ville d&apos;étape
        </label>
        <select
          id="poi-city"
          value={cityKey}
          onChange={(e) => setCityKey(e.target.value)}
          className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
          style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
        >
          {CITIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Filtres de catégorie (classement, jamais exclusion d'un résultat conforme) */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Types de lieux
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = categories.has(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCategory(c.value)}
                className="h-9 px-3 rounded-full text-xs font-semibold"
                style={{
                  background: active ? "var(--accent-amber)" : "var(--bg-base)",
                  color: active ? "var(--text-on-amber)" : "var(--text-secondary)",
                  border: `1px solid ${active ? "var(--accent-amber)" : "var(--border-default)"}`,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Résultats */}
      <div>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }} aria-live="polite">
          {results.length} lieu{results.length > 1 ? "x" : ""} à {city.label} — classés par proximité
        </p>
        {results.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Aucun lieu pour ces filtres. Élargissez les types de lieux.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map(({ poi, distanceKm }) => (
              <PoiCard key={poi.id} poi={poi} distanceKm={distanceKm} day={today} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  coworking: "Coworking",
  museum: "Musée",
  park: "Parc",
  attraction: "Visite",
  "aquarium-zoo": "Aquarium / Zoo",
  playground: "Aire de jeux",
  "family-restaurant": "Restaurant famille",
};

function PoiCard({ poi, distanceKm, day }: { poi: Poi; distanceKm: number; day: number }) {
  const hours = formatHoursForDay(poi, day);
  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          {poi.name}
        </span>
        <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
          {distanceKm} km
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
          {CATEGORY_LABELS[poi.category]}
        </span>
        <SourceBadge status={poi.sourceStatus} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {poi.sourceName}
        </span>
      </div>
      {poi.address && (
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          {poi.address}
        </p>
      )}
      <p className="text-xs mt-0.5" style={{ color: hours === "Horaires inconnus" ? "var(--text-muted)" : "var(--text-secondary)" }}>
        Aujourd&apos;hui : {hours}
      </p>
    </li>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
