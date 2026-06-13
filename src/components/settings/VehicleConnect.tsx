"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getSelectedVehicle, saveSelectedVehicle } from "@/lib/db";
import type { Vehicle, VehicleState } from "@/lib/vehicle/types";

type Phase = "idle" | "listing" | "choosing" | "reading" | "connected" | "error";

const CONNECTIVITY_LABEL: Record<VehicleState["connectivity"], string> = {
  online: "En ligne",
  asleep: "En veille",
  offline: "Hors ligne",
};

export function VehicleConnect() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"mock" | "tesla" | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readState = useCallback(async (vehicleId: string) => {
    setPhase("reading");
    setError(null);
    try {
      const res = await fetch(`/api/vehicle/state?vehicleId=${encodeURIComponent(vehicleId)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Lecture impossible");
      setState(data.state as VehicleState);
      setMode(data.mode);
      setPhase("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de lecture");
      setPhase("error");
    }
  }, []);

  // Reprend une sélection persistée au chargement.
  useEffect(() => {
    let active = true;
    getSelectedVehicle().then((sel) => {
      if (!active || !sel) return;
      setSelectedId(sel.vehicleId);
      void readState(sel.vehicleId);
    });
    return () => {
      active = false;
    };
  }, [readState]);

  async function connect() {
    setPhase("listing");
    setError(null);
    try {
      const res = await fetch("/api/vehicle/list");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Connexion impossible");
      setVehicles(data.vehicles as Vehicle[]);
      setMode(data.mode);
      setPhase("choosing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
      setPhase("error");
    }
  }

  async function choose(v: Vehicle) {
    setSelectedId(v.id);
    await saveSelectedVehicle(v.id, v.displayName);
    await readState(v.id);
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Connexion Tesla
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Lecture ponctuelle de l&apos;état de charge — jamais de suivi continu.
          </p>
        </div>
        {mode && (
          <span className={mode === "tesla" ? "badge-verified shrink-0" : "badge-seed shrink-0"}>
            {mode === "tesla" ? "Compte réel" : "Démo (mock)"}
          </span>
        )}
      </div>

      {(phase === "idle" || phase === "error") && (
        <Button onClick={connect} loading={false}>
          Connecter mon compte Tesla
        </Button>
      )}

      {phase === "listing" && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }} aria-busy="true">
          Récupération des véhicules…
        </p>
      )}

      {(phase === "choosing" || (vehicles.length > 0 && phase !== "connected")) && (
        <div className="space-y-2" role="group" aria-label="Choix du véhicule">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => choose(v)}
              aria-pressed={selectedId === v.id}
              className="w-full text-left p-3 rounded-lg transition-colors"
              style={{
                background: selectedId === v.id ? "var(--bg-surface)" : "var(--bg-base)",
                border: `1px solid ${selectedId === v.id ? "var(--accent-amber)" : "var(--border-default)"}`,
                color: "var(--text-primary)",
              }}
            >
              <span className="font-medium text-sm">{v.displayName}</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {v.model} · VIN {v.vin.slice(-6)} · {v.usableKwh} kWh
              </span>
            </button>
          ))}
        </div>
      )}

      {phase === "reading" && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }} aria-busy="true">
          Lecture de l&apos;état de charge…
        </p>
      )}

      {phase === "connected" && state && (
        <div className="space-y-3" aria-live="polite">
          <BatteryGauge soc={state.soc} limit={state.chargeLimitSoc} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label="État de charge" value={`${state.soc} %`} />
            <Stat label="Autonomie estimée" value={`${state.estimatedRangeKm} km`} />
            <Stat label="Limite de charge" value={`${state.chargeLimitSoc} %`} />
            <Stat
              label="Connectivité"
              value={CONNECTIVITY_LABEL[state.connectivity]}
            />
          </dl>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => selectedId && readState(selectedId)}>
              Rafraîchir l&apos;état
            </Button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Lu le {new Date(state.readAt).toLocaleString("fr-FR")}
            </span>
          </div>
        </div>
      )}

      {phase === "error" && error && (
        <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd className="font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

function BatteryGauge({ soc, limit }: { soc: number; limit: number }) {
  const color =
    soc <= 15 ? "var(--accent-danger)" : soc <= 35 ? "var(--accent-warning)" : "var(--accent-success)";
  return (
    <div
      className="relative h-6 rounded-md overflow-hidden"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
      role="img"
      aria-label={`État de charge ${soc} %, limite ${limit} %`}
    >
      <div className="h-full transition-all" style={{ width: `${soc}%`, background: color }} />
      <div
        className="absolute top-0 bottom-0"
        style={{ left: `${limit}%`, width: "2px", background: "var(--text-primary)" }}
        aria-hidden="true"
      />
    </div>
  );
}
