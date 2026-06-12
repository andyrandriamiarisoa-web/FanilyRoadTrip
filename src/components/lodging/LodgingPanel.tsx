"use client";

import type { DayPlan, LodgingOption } from "@/types";
import { SourceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { generateBookingLinks } from "@/lib/providers/deeplinks";

interface LodgingPanelProps {
  day: DayPlan;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const TIER_LABELS = {
  eco: "Éco-périphérie",
  best: "Meilleur rapport qualité/prix ★",
  character: "Charme / Central ❤",
};

const TO_CONFIRM_LABELS: Record<string, string> = {
  firmMattress: "Matelas ferme",
  desk32: "Bureau ≥ 120 cm (écran 32″)",
  lateCheckout: "Late checkout ~19h",
  babyBed: "Lit bébé / lit parapluie",
};

export function LodgingPanel({ day, selectedId, onSelect }: LodgingPanelProps) {
  if (!day.lodging) return null;

  const checkIn = day.date;
  const checkOutDate = new Date(day.date);
  checkOutDate.setDate(checkOutDate.getDate() + (day.lodging.nights ?? 1));
  const checkOut = checkOutDate.toISOString().split("T")[0];

  const searchLinks = generateBookingLinks({
    city: day.location,
    checkin: checkIn,
    checkout: checkOut,
    adults: 2,
    children: 1,
    lat: day.lodging.lat,
    lng: day.lodging.lng,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Hébergement suggéré ({checkIn} – {checkOut})
      </p>

      <LodgingCard
        option={day.lodging}
        isSelected={selectedId === day.lodging.id}
        onSelect={() => onSelect(day.lodging!.id)}
      />

      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Rechercher d&apos;autres options :
        </p>
        <div className="flex flex-wrap gap-2">
          {searchLinks.map((link) => (
            <a
              key={link.platform}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border transition-opacity hover:opacity-80"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
                minHeight: "auto",
                minWidth: "auto",
              }}
            >
              {link.platform}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function LodgingCard({
  option,
  isSelected,
  onSelect,
}: {
  option: LodgingOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className="card p-4 space-y-3"
      style={{
        borderColor: isSelected ? "var(--accent-amber)" : "var(--border-default)",
        borderWidth: isSelected ? "2px" : "1px",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: "var(--accent-amber)" }}>
              {TIER_LABELS[option.tier]}
            </span>
          </div>
          <h3 className="font-semibold mt-0.5 text-sm" style={{ color: "var(--text-primary)" }}>
            {option.name}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {option.address}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>
            {option.priceTotal.toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {option.nights} nuit{option.nights > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {option.rating !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold" style={{ color: "var(--accent-amber)" }}>
            {option.rating.toFixed(1)}
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            {option.reviewCount ? `(${option.reviewCount.toLocaleString()} avis)` : ""}
          </span>
        </div>
      )}

      {option.score !== undefined && (
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 flex-1 rounded-full overflow-hidden"
            style={{ background: "var(--bg-surface)" }}
            role="progressbar"
            aria-valuenow={option.score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Score d'adéquation : ${option.score}/100`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${option.score}%`, background: scoreColor(option.score) }}
            />
          </div>
          <span className="text-xs font-semibold w-8 text-right" style={{ color: scoreColor(option.score) }}>
            {option.score}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {option.amenities.ac && <AmenityBadge label="Clim" />}
        {option.amenities.parking && <AmenityBadge label="Parking" />}
        {option.amenities.evCharger && <AmenityBadge label="Borne VE" highlight />}
        {option.amenities.desk && <AmenityBadge label="Bureau" />}
        {option.amenities.pool && <AmenityBadge label="Piscine" />}
      </div>

      {option.toConfirm.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: "var(--accent-warning)" }}>
            À confirmer :
          </p>
          <ul className="text-xs space-y-0.5">
            {option.toConfirm.map((key) => (
              <li key={key} className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span aria-hidden="true">□</span>
                {TO_CONFIRM_LABELS[key] ?? key}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <SourceBadge status={option.sourceStatus} />
        {option.bookingLinks && option.bookingLinks.length > 0 && (
          <a
            href={option.bookingLinks[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline underline-offset-2"
            style={{ color: "var(--accent-vine-light)", minHeight: "auto", minWidth: "auto" }}
          >
            Voir sur {option.bookingLinks[0].platform}
          </a>
        )}
      </div>

      <Button
        variant={isSelected ? "primary" : "secondary"}
        size="sm"
        className="w-full"
        onClick={onSelect}
        aria-pressed={isSelected}
      >
        {isSelected ? "Sélectionné" : "Sélectionner"}
      </Button>
    </article>
  );
}

function AmenityBadge({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{
        background: highlight ? "var(--accent-amber)" : "var(--bg-surface)",
        color: highlight ? "var(--text-on-amber)" : "var(--text-secondary)",
      }}
    >
      {label}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--accent-success)";
  if (score >= 50) return "var(--accent-warning)";
  return "var(--accent-danger)";
}
