"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getSelectedVehicle } from "@/lib/db";
import { REFERENCE_TRIP_REQUEST } from "@/data/voyage-reference";
import type { RoutePlanResult } from "@/lib/routing/types";

type SocSource = "target" | "live";

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
  const [heatwave, setHeatwave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RoutePlanResult | null>(null);
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

  async function compute() {
    setLoading(true);
    setError(null);
    setSocNote(null);
    try {
      const { pct, source } = await resolveStartSoc();
      const res = await fetch("/api/route/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: ORIGIN,
          destination: DESTINATION,
          startSocPct: pct,
          startSocSource: source,
          targetArrivalSocPct: targetArrival,
          isHeatwave: heatwave,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Calcul impossible");
      setPlan(data.plan as RoutePlanResult);
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

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Conduite en canicule (surconsommation clim)
        </span>
        <input
          type="checkbox"
          checked={heatwave}
          onChange={(e) => setHeatwave(e.target.checked)}
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

      {plan && <PlanView plan={plan} />}
    </section>
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
