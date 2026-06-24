import type { Metadata } from "next";
import { PlanWizard } from "@/components/plan/PlanWizard";

export const metadata: Metadata = {
  title: "Planifier un voyage",
};

export default function PlanPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Planifier un voyage
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Deux entrées possibles : un voyage <strong>planifié</strong> avec dates
          de départ et de retour, ou un voyage <strong>avec ancre</strong> autour
          d’un événement à date fixe. Le Profil Foyer (bébé, médical, télétravail)
          est appliqué automatiquement.
        </p>
      </header>

      <PlanWizard />
    </div>
  );
}
