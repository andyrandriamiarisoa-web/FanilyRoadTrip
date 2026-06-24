"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/Badge";
import type { AvailabilityResult, HotelOffer } from "@/lib/lodging/availability/types";

/** Villes d'étape (centre approximatif) — alignées sur le seed POI. */
const CITIES: { label: string; lat: number; lng: number }[] = [
  { label: "Dijon", lat: 47.32, lng: 5.04 },
  { label: "Beaune", lat: 47.02, lng: 4.84 },
  { label: "Mâcon", lat: 46.31, lng: 4.83 },
  { label: "Lyon", lat: 45.75, lng: 4.84 },
  { label: "Tain-l'Hermitage", lat: 45.07, lng: 4.84 },
  { label: "Montélimar", lat: 44.56, lng: 4.75 },
  { label: "Marseille", lat: 43.30, lng: 5.37 },
  { label: "Sens", lat: 48.20, lng: 3.28 },
];

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatFreshness(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Recherche de **disponibilité hôtels** (Lot R5) — read-only. Mock par défaut ;
 * LiteAPI sandbox ou Hotelbeds Test en live. On **classe sans exclure** (les
 * complets restent affichés et signalés) ; la **source** et la **fraîcheur**
 * sont toujours indiquées ; aucune action de réservation n'est exposée.
 */
export function LodgingAvailabilitySearch() {
  // Défauts : Marseille 7–9/08/2026 (cf. critère R5).
  const [cityLabel, setCityLabel] = useState("Marseille");
  const [checkIn, setCheckIn] = useState("2026-08-07");
  const [checkOut, setCheckOut] = useState("2026-08-09");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const city = CITIES.find((c) => c.label === cityLabel) ?? CITIES[0];
      const res = await fetch("/api/lodging/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.label,
          lat: city.lat,
          lng: city.lng,
          checkIn,
          checkOut,
          adults: 2,
          children: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Recherche impossible");
      setResult(data as AvailabilityResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de recherche");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Ville</span>
          <select
            value={cityLabel}
            onChange={(e) => setCityLabel(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          >
            {CITIES.map((c) => (
              <option key={c.label} value={c.label}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Arrivée</span>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Départ</span>
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="mt-1 h-11 w-full px-3 rounded-lg text-sm"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
          />
        </label>
      </div>

      <Button onClick={search} loading={loading} disabled={loading}>
        Rechercher les disponibilités
      </Button>

      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>{error}</p>
      )}

      {result && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {result.offers.length} établissement{result.offers.length > 1 ? "s" : ""} · source : {result.sourceName}
          </p>
          {result.notes.map((n, i) => (
            <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>{n}</p>
          ))}
          <ul className="space-y-2">
            {result.offers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer }: { offer: HotelOffer }) {
  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{offer.name}</span>
        <span className="text-sm font-bold shrink-0" style={{ color: offer.available ? "var(--accent-amber)" : "var(--text-muted)" }}>
          {offer.available && offer.priceTotalCents !== null ? formatEur(offer.priceTotalCents) : "Complet"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: offer.available ? "var(--badge-verified-bg)" : "var(--badge-danger-bg)",
            color: offer.available ? "var(--badge-verified-text)" : "var(--badge-danger-text)",
          }}
        >
          {offer.available ? "Disponible" : "Complet"}
        </span>
        {offer.available && offer.priceTotalCents !== null && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {offer.nights} nuit{offer.nights > 1 ? "s" : ""}
          </span>
        )}
        <SourceBadge status={offer.sourceStatus} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{offer.sourceName}</span>
      </div>
      {offer.rating !== undefined && (
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Note {offer.rating}/5</p>
      )}
      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
        Mis à jour : {formatFreshness(offer.readAt)}
      </p>
    </li>
  );
}
