import type { Metadata } from "next";
import { OFFLINE_FEATURES } from "@/lib/offline/offline";

export const metadata: Metadata = {
  title: "Hors ligne",
};

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "var(--bg-surface)" }}
        aria-hidden="true"
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path
            d="M8 20a12 12 0 1124 0 12 12 0 01-24 0z"
            stroke="var(--text-secondary)"
            strokeWidth="2"
          />
          <path
            d="M20 14v8M20 26h.01"
            stroke="var(--accent-amber)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M5 5l30 30"
            stroke="var(--accent-danger)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="space-y-2">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Pas de connexion
        </h1>
        <p
          className="text-base max-w-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Votre carnet de route est disponible hors ligne. Consultez vos étapes
          enregistrées sans réseau.
        </p>
      </div>

      <a
        href="/carnet"
        className="flex items-center justify-center h-12 px-8 rounded-xl font-semibold"
        style={{
          background: "var(--accent-amber)",
          color: "var(--text-on-amber)",
          minWidth: "200px",
        }}
      >
        Consulter le carnet
      </a>

      <div className="card p-4 w-full max-w-xs text-left space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Disponible hors-ligne
        </p>
        <ul className="space-y-1">
          {OFFLINE_FEATURES.map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span aria-hidden="true" style={{ color: "var(--accent-success)" }}>✓</span>
              {f.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
