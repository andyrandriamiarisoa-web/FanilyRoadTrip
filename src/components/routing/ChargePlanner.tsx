"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getSelectedVehicle, loadActiveProfile } from "@/lib/db";
import { REFERENCE_TRIP_REQUEST } from "@/data/voyage-reference";
import type { RoutePlanResult } from "@/lib/routing/types";
import { timelineFromLegs, formatHour } from "@/lib/constraints/fusion";
import type { TimelineEvent, TimelineResult } from "@/lib/constraints/types";
import type { HeatAlert } from "@/lib/constraints/heat-alert";

type SocSource = "target" | "live";

/** Date utilisée pour interroger la couche météo (vigilance chaleur). */
const HEAT_DATE = REFERENCE_TRIP_REQUEST.departureFrom;

const ORIGIN = {
  name: REFERENCE_TRIP_REQUEST.origin,
  lat: REFERENCE_TRIP_REQUEST.originLat,
  lng: REFERENCE_TRIP_REQUEST.originLng,
};
const DESTINATION = {
  name: REFERENCE_TRIP_REQUEST.destination,
  lat: REFERENCE_TRIP_REQUEST.destinationLat,
  lng: REFERENCE_TRIP_REQUEST.destinationLng,
};

export function ChargePlanner() {
  const [socSource, setSocSource] = useState<SocSource>("target");
  const [startSoc, setStartSoc] = useState(90);
  const [targetArrival, setTargetArrival] = useState(20);
  const [forceHeat, setForceHeat] = useState(false);
  const [departureHour, setDepartureHour] = useState(8);
  const [workDay, setWorkDay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RoutePlanResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineResult | null>(null);
  const [heatAlert, setHeatAlert] = useState<HeatAlert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socNote, setSocNote] = useState<string | null>(null);

  async function resolveStartSoc(): Promise<{ pct: number; source: SocSource }> {
    if (socSource !== "live") return { pct: startSoc, source: "target" };
    // Lecture du SoC réel du véhicule sélectionné (M3).
    const sel = await getSelectedVehicle();
    if (!sel) {
      setSocNote("Aucun véhicule connecté — repli sur le SoC cible.");
      return { pct: startSoc, source: "target" };
    }
    const res = await fetch(`/api/vehicle/state?vehicleId=${encodeURIComponent(sel.vehicleId)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setSocNote("Lecture véhicule impossible — repli sur le SoC cible.");
      return { pct: startSoc, source: "target" };
    }
    setSocNote(`SoC réel lu : ${data.state.soc} % (${sel.displayName}).`);
    return { pct: data.state.soc, source: "live" };
  }

  async function planRoute(pct: number, source: SocSource, isHeatwave: boolean): Promise<RoutePlanResult> {
    const res = await fetch("/api/route/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: ORIGIN,
        destination: DESTINATION,
        startSocPct: pct,
        startSocSource: source,
        targetArrivalSocPct: targetArrival,
        isHeatwave,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Calcul impossible");
    return data.plan as RoutePlanResult;
  }

  /**
   * Alerte chaleur auto-détectée depuis la couche météo (origine + destination
   * + arrêts de charge). Le blocage 12h–16h n'est PAS systématique : il dépend
   * d'une vigilance chaleur réelle. Renvoie null si la météo est indisponible.
   */
  async function detectHeatAlert(routePlan: RoutePlanResult): Promise<HeatAlert | null> {
    const points = [
      { name: ORIGIN.name, lat: ORIGIN.lat, lng: ORIGIN.lng },
      { name: DESTINATION.name, lat: DESTINATION.lat, lng: DESTINATION.lng },
      ...routePlan.chargeStops.map((s) => ({ name: s.superchargerName, lat: s.lat, lng: s.lng })),
    ];
    try {
      const res = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: HEAT_DATE, points }),
      });
      const data = await res.json();
      if (res.ok && data.ok) return data.heatAlert as HeatAlert;
    } catch {
      // Météo indisponible → on s'en tient au réglage manuel, sans bloquer.
    }
    return null;
  }

  async function compute() {
    setLoading(true);
    setError(null);
    setSocNote(null);
    setHeatAlert(null);
    try {
      const { pct, source } = await resolveStartSoc();

      // 1) Plan initial (canicule = réglage manuel s'il est forcé).
      let routePlan = await planRoute(pct, source, forceHeat);

      // 2) Vigilance chaleur réelle sur le trajet (météo par segment).
      const alert = await detectHeatAlert(routePlan);
      setHeatAlert(alert);
      const effectiveHeat = forceHeat || (alert?.active ?? false);

      // 3) Si la canicule est auto-détectée, replanifier avec la surconsommation.
      if (effectiveHeat !== forceHeat) {
        routePlan = await planRoute(pct, source, effectiveHeat);
      }
      setPlan(routePlan);

      // 4) Fusion des contraintes (M5) : pauses bébé, canicule (conditionnelle), télétravail.
      const profile = await loadActiveProfile();
      const legs = routePlan.segments.map((seg, i) => ({
        driveMinutes: seg.durationMinutes,
        toName: seg.toName,
        chargeMinutes: routePlan.chargeStops[i]?.chargeMinutes,
        chargerName: routePlan.chargeStops[i]?.superchargerName,
      }));
      setTimeline(
        timelineFromLegs(legs, {
          departureHour,
          maxLegMinutes: profile.baby.maxLegMinutes,
          isHeatwave: effectiveHeat,
          heatWindow: profile.baby.noDrivingHours,
          isWorkDay: workDay,
          workWindow: [profile.work.workStartHour, profile.work.workEndHour],
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de calcul");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Trajet charge-aware
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {ORIGIN.name} → {DESTINATION.name} · Superchargeurs uniquement, fenêtre batterie préservée.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          SoC de départ
        </legend>
        <div className="flex flex-wrap gap-2">
          <SocSourceButton
            active={socSource === "target"}
            label="Cible"
            onClick={() => setSocSource("target")}
          />
          <SocSourceButton
            active={socSource === "live"}
            label="Véhicule (réel)"
            onClick={() => setSocSource("live")}
          />
        </div>
        {socSource === "target" && (
          <PercentField label="SoC de départ cible" value={startSoc} onChange={setStartSoc} />
        )}
      </fieldset>

      <PercentField
        label="SoC d'arrivée souhaité"
        value={targetArrival}
        onChange={setTargetArrival}
      />

      <PercentLikeField
        label="Heure de départ"
        suffix="h"
        value={departureHour}
        min={0}
        max={23}
        onChange={setDepartureHour}
      />

      <div className="space-y-1">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Forcer la vigilance canicule (simulation)
          </span>
          <input
            type="checkbox"
            checked={forceHeat}
            onChange={(e) => setForceHeat(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent-amber)]"
          />
        </label>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Par défaut, le blocage 12h–16h s&apos;applique uniquement si la météo signale
          une vigilance chaleur sur le trajet. Aucune alerte → conduite libre.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Jour travaillé (pas de conduite en heures ouvrées)
        </span>
        <input
          type="checkbox"
          checked={workDay}
          onChange={(e) => setWorkDay(e.target.checked)}
          className="h-5 w-5 accent-[var(--accent-amber)]"
        />
      </label>

      <Button onClick={compute} loading={loading} disabled={loading}>
        Calculer les arrêts de charge
      </Button>

      {socNote && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {socNote}
        </p>
      )}
      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
          {error}
        </p>
      )}

      {heatAlert && <HeatAlertBanner alert={heatAlert} />}
      {plan && <PlanView plan={plan} />}
      {timeline && <TimelineView timeline={timeline} />}
    </section>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  seed: "indicatif (seed)",
  estimated: "estimé",
  verified: "vérifié (météo live)",
};

function HeatAlertBanner({ alert }: { alert: HeatAlert }) {
  const active = alert.active;
  return (
    <div
      className="text-xs p-2.5 rounded-lg space-y-1"
      role="status"
      style={{
        background: active ? "var(--accent-warning)" : "var(--bg-surface)",
        color: active ? "var(--text-on-amber)" : "var(--text-primary)",
      }}
    >
      <p className="font-medium">
        <span aria-hidden="true">{active ? "🌡️ " : "✓ "}</span>
        {alert.reason}
      </p>
      {alert.sourceStatus && (
        <p style={{ color: active ? "var(--text-on-amber)" : "var(--text-secondary)" }}>
          Source météo : {SOURCE_LABELS[alert.sourceStatus] ?? alert.sourceStatus}
        </p>
      )}
    </div>
  );
}

const EVENT_STYLE: Record<TimelineEvent["type"], { bg: string; fg: string; icon: string }> = {
  drive: { bg: "var(--bg-base)", fg: "var(--text-primary)", icon: "🚗" },
  charge: { bg: "var(--bg-surface)", fg: "var(--text-primary)", icon: "⚡" },
  "baby-pause": { bg: "var(--badge-seed-bg)", fg: "var(--badge-seed-text)", icon: "🍼" },
  "heat-block": { bg: "var(--accent-warning)", fg: "var(--text-on-amber)", icon: "🌡️" },
  "work-block": { bg: "var(--accent-vine)", fg: "#fff", icon: "💼" },
};

function TimelineView({ timeline }: { timeline: TimelineResult }) {
  return (
    <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
        Chronologie heure par heure
      </h3>

      {!timeline.feasibleWithinDay && (
        <p
          className="text-xs p-2 rounded"
          role="alert"
          style={{ color: "var(--text-on-amber)", background: "var(--accent-warning)" }}
        >
          {timeline.conflicts[0] ?? "Conduite à répartir sur plusieurs jours."}
        </p>
      )}

      <ol className="space-y-1">
        {timeline.events.map((ev, i) => {
          const s = EVENT_STYLE[ev.type];
          return (
            <li
              key={i}
              className="flex items-center gap-2 text-xs p-2 rounded-lg"
              style={{ background: s.bg, color: s.fg }}
            >
              <span aria-hidden="true">{s.icon}</span>
              <span className="font-mono tabular-nums">
                {formatHour(ev.startHour)}–{formatHour(ev.endHour)}
              </span>
              <span>{ev.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PlanView({ plan }: { plan: RoutePlanResult }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap gap-3 text-sm">
        <Metric label="Distance" value={`${Math.round(plan.totalDistanceKm)} km`} />
        <Metric label="Conduite" value={fmtMinutes(plan.totalDrivingMinutes)} />
        <Metric label="Charge" value={fmtMinutes(plan.totalChargingMinutes)} />
        <Metric
          label="Arrivée"
          value={`${Math.round(plan.arrivalSocPct)} %`}
          ok={plan.arrivalMeetsTarget}
        />
      </div>

      {!plan.feasible && (
        <p
          className="text-sm font-medium p-3 rounded-lg"
          role="alert"
          style={{ color: "var(--accent-danger)", background: "var(--bg-base)" }}
        >
          Trajet infaisable en l&apos;état.
        </p>
      )}
      {plan.conflicts.map((c, i) => (
        <p
          key={i}
          className="text-xs p-2 rounded"
          style={{ color: "var(--text-on-amber)", background: "var(--accent-warning)" }}
        >
          {c}
        </p>
      ))}

      <ol className="space-y-2">
        {plan.segments.map((seg, i) => {
          const stop = plan.chargeStops[i];
          return (
            <li key={i} className="text-sm">
              <div
                className="p-3 rounded-lg"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {seg.fromName} → {seg.toName}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {Math.round(seg.distanceKm)} km · {fmtMinutes(seg.durationMinutes)}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Batterie {Math.round(seg.startSocPct)} % → {Math.round(seg.endSocPct)} %
                </div>
              </div>
              {stop && (
                <div
                  className="mt-1 ml-3 p-2.5 rounded-lg text-xs"
                  style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
                >
                  <span className="font-semibold">⚡ Recharge — {stop.superchargerName}</span>
                  <span className="block mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {Math.round(stop.socOnArrivalPct)} % → {Math.round(stop.socOnDeparturePct)} % ·{" "}
                    {stop.chargeMinutes} min · {stop.maxKw} kW {stop.version}
                  </span>
                  {stop.precondition && (
                    <span className="block mt-0.5" style={{ color: "var(--accent-amber)" }}>
                      Lancez la navigation Tesla vers la borne pour préconditionner la batterie.
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SocSourceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="h-11 px-4 rounded-lg text-sm font-semibold"
      style={{
        background: active ? "var(--accent-amber)" : "var(--bg-base)",
        color: active ? "var(--text-on-amber)" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--accent-amber)" : "var(--border-default)"}`,
      }}
    >
      {label}
    </button>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(Math.max(0, Math.min(100, e.target.valueAsNumber)))}
          className="h-11 w-20 px-3 rounded-lg text-sm"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
        />
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          %
        </span>
      </span>
    </label>
  );
}

function PercentLikeField({
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, e.target.valueAsNumber)))}
          className="h-11 w-20 px-3 rounded-lg text-sm"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
        />
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {suffix}
        </span>
      </span>
    </label>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div
        className="font-semibold"
        style={{
          color:
            ok === undefined
              ? "var(--text-primary)"
              : ok
                ? "var(--accent-success)"
                : "var(--accent-danger)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
