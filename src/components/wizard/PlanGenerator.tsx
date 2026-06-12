"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { saveTrip } from "@/lib/db";
import type { TripPlan } from "@/types";
import { REFERENCE_TRIP_REQUEST } from "@/data/voyage-reference";

type Step = "config" | "generating" | "done" | "error";

export function PlanGenerator() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("config");
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setStep("generating");
    setProgress([]);
    setError(null);

    const steps = [
      "Analyse du profil famille...",
      "Calcul du calendrier (télétravail, week-ends, événements)...",
      "Planification des segments de route...",
      "Modélisation des recharges Tesla...",
      "Vérification médicale et bébé...",
      "Sélection des hébergements...",
      "Vérification de la connectivité 5G...",
      "Génération du carnet de route...",
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setProgress((prev) => [...prev, steps[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 400);

    try {
      const res = await fetch("/api/agents/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(REFERENCE_TRIP_REQUEST),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur serveur");
      }

      const data = await res.json();
      const plan: TripPlan = data.plan;

      await saveTrip(plan);
      setStep("done");

      setTimeout(() => {
        router.push("/carnet");
      }, 1500);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStep("error");
    }
  }

  if (step === "config") {
    return (
      <div className="space-y-5">
        <TripSummaryCard />

        <div className="card p-5 space-y-3">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Contraintes appliquées
          </h2>
          <ul className="text-sm space-y-2" style={{ color: "var(--text-secondary)" }}>
            {CONSTRAINTS.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span style={{ color: "var(--accent-amber)" }} aria-hidden="true">—</span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <Button onClick={generate} size="lg" className="w-full">
          Générer le voyage de référence
        </Button>
      </div>
    );
  }

  if (step === "generating") {
    return (
      <div className="space-y-5">
        <div
          className="card p-6 text-center space-y-4"
          role="status"
          aria-live="polite"
          aria-label="Génération du plan en cours"
        >
          <div className="flex items-center justify-center">
            <Spinner />
          </div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Génération en cours...
          </p>
        </div>

        <div className="space-y-2">
          {progress.map((msg, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-sm animate-in fade-in"
              style={{ color: i === progress.length - 1 ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <span
                style={{
                  color: "var(--accent-success)",
                  fontSize: "10px",
                }}
                aria-hidden="true"
              >
                ✓
              </span>
              {msg}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div
        className="card p-8 text-center space-y-4"
        role="status"
        aria-live="polite"
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "var(--accent-success)" }}
          aria-hidden="true"
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M8 17l6 6L24 11"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
          Plan généré !
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Redirection vers le carnet de route...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="card p-5 space-y-3"
        role="alert"
        style={{ borderColor: "var(--accent-danger)" }}
      >
        <p className="font-semibold" style={{ color: "var(--accent-danger)" }}>
          Erreur lors de la génération
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {error}
        </p>
      </div>
      <Button
        onClick={() => {
          setStep("config");
          setProgress([]);
          setError(null);
        }}
        variant="secondary"
      >
        Réessayer
      </Button>
    </div>
  );
}

function TripSummaryCard() {
  return (
    <div
      className="card-warm p-5 space-y-3"
      aria-label="Résumé du voyage de référence"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold" style={{ color: "var(--text-on-card-warm)" }}>
            Fresnes (94) ↔ Marseille
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            31 juillet – 14 août 2026 · 15 jours
          </p>
        </div>
        <span className="badge-seed">Seed</span>
      </div>

      <div
        className="grid grid-cols-2 gap-3 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <StatRow label="Étapes" value="7 villes" />
        <StatRow label="Mariage" value="8 août 11h30" />
        <StatRow label="Télétravail" value="Lun–Jeu" />
        <StatRow label="À Dijon" value="4 nuits" />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-muted)" }}>{label} : </span>
      <span
        className="font-medium"
        style={{ color: "var(--text-on-card-warm)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="var(--bg-surface)"
        strokeWidth="4"
      />
      <path
        d="M24 4a20 20 0 0120 20"
        stroke="var(--accent-amber)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const CONSTRAINTS = [
  "Tesla Model S Raven — Superchargeurs uniquement, buffer 12%, cible 80%",
  "Bébé 6 mois — Pauses toutes les 90–120 min, jamais 12h–16h en canicule",
  "Spondylarthrite — Matelas ferme obligatoire (à confirmer sur chaque logement)",
  "Télétravail lun–jeu 8h30–19h — Bureau ≥ 120 cm, fibre + secours 5G SFR",
  "Conduite ≤ 2h20, le soir après 19h les jours travaillés",
  "Mariage le 8 août à 11h30 — Logement ≤ 10 min du 258 bd Romain Rolland",
  "Hébergements : panel large éco/★/❤, score multi-critères, no filtre excluant",
];
