import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/ProfileSettings";

export const metadata: Metadata = {
  title: "Paramètres",
};

export default function ParametresPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Paramètres
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Profil famille, préférences et données de voyage.
        </p>
      </header>

      <ProfileSettings />

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Données & sources
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Les données sont issues du seed embarqué (Annexe A) en mode MOCK.
          En mode LIVE, elles sont enrichies via Open-Meteo, OSRM et Open Charge Map.
        </p>
        <div className="flex gap-2 flex-wrap">
          <span className="badge-seed">Seed</span>
          <span className="badge-estimated">Estimé</span>
          <span className="badge-verified">Vérifié</span>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Couverture 5G SFR (données ARCEP)
        </h2>
        <div className="text-sm space-y-1.5">
          {COVERAGE_5G.map((c) => (
            <div key={c.city} className="flex items-center justify-between">
              <span style={{ color: "var(--text-secondary)" }}>{c.city}</span>
              <span
                className="font-medium"
                style={{ color: c.color }}
              >
                {c.quality}
              </span>
            </div>
          ))}
        </div>
        <a
          href="https://monreseaumobile.arcep.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline underline-offset-2"
          style={{ color: "var(--accent-vine-light)" }}
        >
          Vérifier sur monreseaumobile.arcep.fr
        </a>
      </section>
    </div>
  );
}

const COVERAGE_5G = [
  { city: "Dijon", quality: "Bonne", color: "var(--accent-success)" },
  { city: "Mâcon", quality: "Bonne", color: "var(--accent-success)" },
  { city: "Montélimar", quality: "Excellente (16 antennes)", color: "var(--accent-success)" },
  { city: "Beaune", quality: "Correcte", color: "var(--accent-warning)" },
  { city: "Grignan", quality: "Insuffisante (~29 Mbit/s) — visite seule", color: "var(--accent-danger)" },
  { city: "Tain-l'Hermitage", quality: "Étape-nuit (non requis)", color: "var(--text-muted)" },
  { city: "Sens", quality: "Étape-nuit (non requis)", color: "var(--text-muted)" },
];
