import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accueil — Odyssée",
};

export default function HomePage() {
  return (
    <div
      className="flex flex-col items-center justify-center flex-1 p-6 gap-8 text-center"
    >
      {/* Hero */}
      <div className="space-y-4 max-w-md">
        <div className="flex items-center justify-center gap-3">
          <TeslaIcon />
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Odyssée
          </h1>
        </div>

        <p
          className="text-lg leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Votre carnet de route sur mesure — recharges Tesla, contraintes bébé,
          médicales et télétravail prises en compte automatiquement.
        </p>
      </div>

      {/* CTA principal */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        <Link
          href="/plan"
          className="flex-1 flex items-center justify-center h-14 rounded-2xl text-base font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "var(--accent-amber)",
            color: "var(--text-on-amber)",
          }}
        >
          Planifier mon voyage
        </Link>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full mt-4">
        {FEATURES.map((f) => (
          <FeatureCard key={f.label} icon={f.icon} label={f.label} />
        ))}
      </div>

      {/* Comment ça marche — état neutre, sans itinéraire codé en dur */}
      <div
        className="card-warm p-5 max-w-md w-full text-left space-y-3"
        aria-label="Comment ça marche"
      >
        <p className="font-bold text-sm" style={{ color: "var(--text-muted)" }}>
          COMMENT ÇA MARCHE
        </p>
        <ol className="space-y-2">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span
                className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                style={{ background: "var(--accent-amber)", color: "var(--text-on-amber)" }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="text-sm" style={{ color: "var(--text-on-card-warm)" }}>
                {step}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 flex-wrap pt-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            Fonctionne hors-ligne · Mode MOCK disponible
          </span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  "Composez votre itinéraire : étapes, dates et événements fixes.",
  "L'app vérifie les recharges Tesla, la météo, les hébergements et vos jours de télétravail.",
  "Suivez votre carnet de route détaillé, même sans connexion.",
];

const FEATURES = [
  { icon: "⚡", label: "Recharges Tesla" },
  { icon: "🗓", label: "Calendrier travail" },
  { icon: "🌡", label: "Météo canicule" },
  { icon: "🏨", label: "Hébergements adaptés" },
];

function FeatureCard({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="card p-4 flex flex-col items-center gap-2 text-center"
      role="img"
      aria-label={label}
    >
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}

function TeslaIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="17" stroke="var(--accent-amber)" strokeWidth="2" />
      <path
        d="M9 14h18M18 14v10M13 14c0-2 2-4 5-4s5 2 5 4"
        stroke="var(--accent-amber)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
