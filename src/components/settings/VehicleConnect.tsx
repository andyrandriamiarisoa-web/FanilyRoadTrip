"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getSelectedVehicle, saveSelectedVehicle } from "@/lib/db";
import type {
  CommandResult,
  Vehicle,
  VehicleCommand,
  VehicleState,
} from "@/lib/vehicle/types";

type Phase = "idle" | "listing" | "choosing" | "reading" | "connected" | "error";

const CONNECTIVITY_LABEL: Record<VehicleState["connectivity"], string> = {
  online: "En ligne",
  asleep: "En veille",
  offline: "Hors ligne",
};

interface Banner {
  kind: "success" | "error";
  text: string;
}

/** Commandes proposées dans l'UI (confort + charge ; aucune commande de conduite). */
const COMMAND_BUTTONS: { label: string; command: VehicleCommand }[] = [
  { label: "Réveiller", command: { type: "wake" } },
  { label: "Climatisation ON", command: { type: "start_climate" } },
  { label: "Climatisation OFF", command: { type: "stop_climate" } },
  { label: "Démarrer la charge", command: { type: "start_charging" } },
  { label: "Arrêter la charge", command: { type: "stop_charging" } },
];

export function VehicleConnect() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"mock" | "tesla" | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [busyCommand, setBusyCommand] = useState<string | null>(null);
  const [chargeLimit, setChargeLimit] = useState(80);
  const [waking, setWaking] = useState(false);
  const [wakeNote, setWakeNote] = useState<string | null>(null);

  const readState = useCallback(async (vehicleId: string) => {
    setPhase("reading");
    setError(null);
    try {
      const res = await fetch(`/api/vehicle/state?vehicleId=${encodeURIComponent(vehicleId)}`);
      const data = await res.json();
      if (data.needsAuth) {
        // Session expirée / non connecté : on repasse à l'écran de connexion.
        setPhase("idle");
        setMode("tesla");
        return;
      }
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

  // Retour du flux OAuth Tesla (?tesla=connected|error) : message + nettoyage URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("tesla");
    if (!status) return;
    const reason = params.get("reason");
    // Retire les paramètres de l'URL sans recharger la page.
    window.history.replaceState({}, "", window.location.pathname);

    // Les mises à jour d'état sont déportées hors du corps de l'effet (évite
    // la règle « set-state-in-effect » / les rendus en cascade).
    void (async () => {
      if (status === "connected") {
        setBanner({ kind: "success", text: "Compte Tesla connecté." });
        await connect();
      } else if (status === "error") {
        setBanner({ kind: "error", text: oauthErrorMessage(reason) });
      }
    })();
  }, []);

  async function connect() {
    setPhase("listing");
    setError(null);
    try {
      const res = await fetch("/api/vehicle/list");
      const data = await res.json();
      if (data.needsAuth) {
        // Mode live non connecté → on lance le flux OAuth Tesla (redirection).
        window.location.href = "/api/tesla/auth/login";
        return;
      }
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

  /**
   * Réveille le véhicule puis sonde l'état jusqu'à ce que la Fleet API le voie
   * « en ligne » (la voiture peut être affichée dans l'app Tesla tout en étant
   * `asleep` côté Fleet API — il faut un `wake_up` pour lire le SoC réel).
   * Sondage borné (coût Fleet API) ; l'état non-online n'est pas mis en cache,
   * donc chaque sonde voit la vraie transition.
   */
  async function wakeAndRead(vehicleId: string) {
    setWaking(true);
    setWakeNote("Réveil du véhicule en cours… (cela peut prendre ~30 s)");
    setError(null);
    try {
      const res = await fetch("/api/vehicle/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, command: { type: "wake" } }),
      });
      const data = await res.json();
      if (data.needsAuth) {
        window.location.href = "/api/tesla/auth/login";
        return;
      }
      const result: CommandResult | undefined = data.result;
      if (result && !result.ok) {
        // Réveil refusé (ex. exigence de commandes signées) : on l'affiche.
        setCommandResult(result);
        setWakeNote(null);
        return;
      }
      // Sondage : jusqu'à 7 tentatives espacées de ~3 s (~21 s).
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const sres = await fetch(
          `/api/vehicle/state?vehicleId=${encodeURIComponent(vehicleId)}`,
        );
        const sdata = await sres.json();
        if (sdata.needsAuth) {
          window.location.href = "/api/tesla/auth/login";
          return;
        }
        if (sres.ok && sdata.ok) {
          setState(sdata.state as VehicleState);
          setMode(sdata.mode);
          setPhase("connected");
          if ((sdata.state as VehicleState).connectivity === "online") {
            setWakeNote(null);
            return;
          }
        }
      }
      setWakeNote(
        "Le véhicule ne s'est pas réveillé à temps. Réessaie dans un instant — ou ouvre l'app Tesla pour le réveiller, puis « Rafraîchir l'état ».",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du réveil");
    } finally {
      setWaking(false);
    }
  }

  async function disconnect() {
    await fetch("/api/tesla/auth/logout", { method: "POST" });
    setPhase("idle");
    setMode(null);
    setVehicles([]);
    setState(null);
    setCommandResult(null);
    setBanner({ kind: "success", text: "Compte Tesla déconnecté." });
  }

  async function runCommand(command: VehicleCommand, key: string) {
    if (!selectedId) return;
    setBusyCommand(key);
    setCommandResult(null);
    try {
      const res = await fetch("/api/vehicle/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: selectedId, command }),
      });
      const data = await res.json();
      if (data.needsAuth) {
        window.location.href = "/api/tesla/auth/login";
        return;
      }
      const result: CommandResult = data.result ?? {
        ok: false,
        message: data.error ?? "Commande impossible.",
        requiresSignedCommand: false,
      };
      setCommandResult(result);
      // En cas de succès, l'état a pu changer : on le relit.
      if (result.ok) void readState(selectedId);
    } catch (e) {
      setCommandResult({
        ok: false,
        message: e instanceof Error ? e.message : "Erreur de commande.",
        requiresSignedCommand: false,
      });
    } finally {
      setBusyCommand(null);
    }
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Connexion Tesla
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Lecture de l&apos;état de charge et commandes confort — jamais de suivi continu.
          </p>
        </div>
        {mode && (
          <span className={mode === "tesla" ? "badge-verified shrink-0" : "badge-seed shrink-0"}>
            {mode === "tesla" ? "Compte réel" : "Démo (mock)"}
          </span>
        )}
      </div>

      {banner && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          role="status"
          style={{
            background: banner.kind === "success" ? "var(--badge-verified-bg)" : "var(--badge-danger-bg)",
            color: banner.kind === "success" ? "var(--badge-verified-text)" : "var(--badge-danger-text)",
          }}
        >
          {banner.text}
        </p>
      )}

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

      {/* Véhicule en ligne : on affiche le vrai état de charge. */}
      {phase === "connected" && state && state.connectivity === "online" && (
        <div className="space-y-3" aria-live="polite">
          <BatteryGauge soc={state.soc} limit={state.chargeLimitSoc} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label="État de charge" value={`${state.soc} %`} />
            <Stat label="Autonomie estimée" value={`${state.estimatedRangeKm} km`} />
            <Stat label="Limite de charge" value={`${state.chargeLimitSoc} %`} />
            <Stat label="Connectivité" value={CONNECTIVITY_LABEL[state.connectivity]} />
          </dl>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => selectedId && readState(selectedId)}>
              Rafraîchir l&apos;état
            </Button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Lu le {new Date(state.readAt).toLocaleString("fr-FR")}
            </span>
          </div>

          <CommandPanel
            busyCommand={busyCommand}
            chargeLimit={chargeLimit}
            onChargeLimit={setChargeLimit}
            onCommand={runCommand}
            result={commandResult}
          />

          {mode === "tesla" && (
            <Button variant="secondary" size="sm" onClick={disconnect}>
              Déconnecter le compte Tesla
            </Button>
          )}
        </div>
      )}

      {/* Véhicule en veille/hors-ligne : on NE montre PAS une fausse jauge 0 %.
          On explique honnêtement et on propose de réveiller pour lire le SoC réel. */}
      {phase === "connected" && state && state.connectivity !== "online" && (
        <div className="space-y-3" aria-live="polite">
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Véhicule {state.connectivity === "asleep" ? "en veille" : "hors ligne"} (Fleet API)
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              La voiture peut apparaître dans l&apos;app Tesla tout en étant
              <strong> endormie</strong> côté API : Tesla la laisse dormir pour
              préserver la batterie. L&apos;état de charge n&apos;est pas lisible
              tant qu&apos;elle n&apos;est pas réveillée — on ne l&apos;invente pas.
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Dernière vérification : {new Date(state.readAt).toLocaleString("fr-FR")}
            </p>
          </div>

          {wakeNote && (
            <p className="text-sm" role="status" style={{ color: "var(--text-secondary)" }}>
              {wakeNote}
            </p>
          )}
          {commandResult && !commandResult.ok && (
            <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
              {commandResult.message}
            </p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => selectedId && wakeAndRead(selectedId)}
              loading={waking}
              disabled={waking}
            >
              Réveiller et lire l&apos;état
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectedId && readState(selectedId)}
              disabled={waking}
            >
              Rafraîchir l&apos;état
            </Button>
          </div>

          {mode === "tesla" && (
            <Button variant="secondary" size="sm" onClick={disconnect} disabled={waking}>
              Déconnecter le compte Tesla
            </Button>
          )}
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

function CommandPanel({
  busyCommand,
  chargeLimit,
  onChargeLimit,
  onCommand,
  result,
}: {
  busyCommand: string | null;
  chargeLimit: number;
  onChargeLimit: (v: number) => void;
  onCommand: (command: VehicleCommand, key: string) => void;
  result: CommandResult | null;
}) {
  return (
    <div className="space-y-2 pt-1" role="group" aria-label="Commandes du véhicule">
      <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
        COMMANDES
      </p>
      <div className="flex flex-wrap gap-2">
        {COMMAND_BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={busyCommand !== null}
            onClick={() => onCommand(b.command, b.label)}
            className="text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            {busyCommand === b.label ? "…" : b.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="block text-xs mb-1">Limite de charge (%)</span>
          <input
            type="number"
            min={50}
            max={100}
            value={chargeLimit}
            onChange={(e) => onChargeLimit(Number(e.target.value))}
            className="w-24 px-2 py-2 rounded-lg text-sm"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <button
          type="button"
          disabled={busyCommand !== null}
          onClick={() =>
            onCommand({ type: "set_charge_limit", percent: clampLimit(chargeLimit) }, "set_charge_limit")
          }
          className="text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          {busyCommand === "set_charge_limit" ? "…" : "Appliquer la limite"}
        </button>
      </div>

      {result && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          role={result.ok ? "status" : "alert"}
          style={{
            background: result.ok ? "var(--badge-verified-bg)" : "var(--badge-danger-bg)",
            color: result.ok ? "var(--badge-verified-text)" : "var(--badge-danger-text)",
          }}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return 80;
  return Math.max(50, Math.min(100, Math.round(n)));
}

function oauthErrorMessage(reason: string | null): string {
  switch (reason) {
    case "state":
      return "Connexion Tesla refusée (jeton de sécurité invalide). Réessayez.";
    case "secret":
      return "Configuration serveur incomplète (secret de chiffrement manquant).";
    case "config":
      return "Configuration OAuth Tesla absente côté serveur.";
    case "exchange":
      return "Échec de l'échange du code OAuth avec Tesla. Réessayez.";
    default:
      return "La connexion Tesla a échoué. Réessayez.";
  }
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
