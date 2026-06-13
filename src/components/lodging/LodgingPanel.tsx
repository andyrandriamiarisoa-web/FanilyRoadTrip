"use client";

import { useEffect, useState } from "react";
import type { DayPlan, FamilyProfile, LodgingOption } from "@/types";
import { SourceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { generateBookingLinks } from "@/lib/providers/deeplinks";
import { loadActiveProfile } from "@/lib/db";
import {
  assessWorkation,
  getCoverageForCommune,
  getCoworkingForCommune,
  type ConformityStatus,
  type WorkationAssessment,
} from "@/lib/lodging/workation";

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
  const [profile, setProfile] = useState<FamilyProfile | null>(null);

  useEffect(() => {
    let active = true;
    loadActiveProfile()
      .then((p) => active && setProfile(p))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!day.lodging) return null;

  const lodging = day.lodging;
  const workNight = day.workStatus === "full" || day.workStatus === "partial";
  const workation: WorkationAssessment | null = profile
    ? assessWorkation(lodging, {
        requiresDeskCm: profile.work.requiresDeskCm,
        requiresFiber: profile.work.requiresFiber,
        fallback5G: profile.work.fallback5G,
        acRequired: profile.medical.acRequired,
        firmMattressRequired: profile.medical.requiresFirmMattress,
        coverageQuality: getCoverageForCommune(day.location)?.quality,
        coverageMbps: getCoverageForCommune(day.location)?.estimatedMbps,
        allowSharedOffice: profile.work.allowSharedOffice,
        maxOfficeMinutesSkateboard: profile.work.maxOfficeMinutesSkateboard,
        sharedOffice: getCoworkingForCommune(day.location),
      })
    : null;

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
        option={lodging}
        isSelected={selectedId === lodging.id}
        onSelect={() => onSelect(lodging.id)}
        workation={workation}
        workNight={workNight}
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

const CONFORMITY_BADGE: Record<ConformityStatus, string> = {
  conforme: "badge-verified",
  "à confirmer": "badge-estimated",
  "non conforme": "badge-danger",
};

function WorkationConformity({
  assessment,
  workNight,
}: {
  assessment: WorkationAssessment;
  workNight: boolean;
}) {
  return (
    <div
      className="space-y-2 p-3 rounded-lg"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Conformité télétravail{workNight ? " (nuit travaillée)" : ""}
        </span>
        <span className={CONFORMITY_BADGE[assessment.overall]}>{assessment.overall}</span>
      </div>
      <ul className="space-y-1">
        {assessment.criteria.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs">
            <span className={`${CONFORMITY_BADGE[c.status]} shrink-0`}>{c.label}</span>
            <span style={{ color: "var(--text-secondary)" }}>{c.detail}</span>
          </li>
        ))}
      </ul>

      {assessment.sharedOfficeUsed && (
        <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <span aria-hidden="true">🛹</span>
          <span>
            Bureau partagé « {assessment.sharedOfficeUsed.name} » à{" "}
            {assessment.sharedOfficeUsed.minutesBySkateboard} min en skateboard.
          </span>
        </p>
      )}

      {assessment.lateCheckoutSoftened && (
        <p className="text-xs flex items-start gap-2">
          <span className="badge-verified shrink-0">Late checkout</span>
          <span style={{ color: "var(--text-secondary)" }}>
            assoupli grâce au bureau partagé proche.
          </span>
        </p>
      )}
    </div>
  );
}

function LodgingCard({
  option,
  isSelected,
  onSelect,
  workation,
  workNight,
}: {
  option: LodgingOption;
  isSelected: boolean;
  onSelect: () => void;
  workation?: WorkationAssessment | null;
  workNight?: boolean;
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

      {workation && <WorkationConformity assessment={workation} workNight={workNight ?? false} />}

      {option.toConfirm.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: "var(--accent-warning)" }}>
            À confirmer :
          </p>
          <ul className="text-xs space-y-0.5">
            {option.toConfirm.map((key) => {
              const softened = key === "lateCheckout" && workation?.lateCheckoutSoftened;
              return (
                <li
                  key={key}
                  className="flex items-center gap-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span aria-hidden="true">{softened ? "✓" : "□"}</span>
                  <span>
                    {TO_CONFIRM_LABELS[key] ?? key}
                    {softened && " — assoupli (bureau partagé proche)"}
                  </span>
                </li>
              );
            })}
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
