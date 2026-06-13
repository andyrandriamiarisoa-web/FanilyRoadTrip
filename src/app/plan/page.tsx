import type { Metadata } from "next";
import { PlanGenerator } from "@/components/wizard/PlanGenerator";
import { ChargePlanner } from "@/components/routing/ChargePlanner";

export const metadata: Metadata = {
  title: "Générer le voyage",
};

export default function PlanPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Générer votre plan de voyage
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Le voyage de référence Fresnes ↔ Marseille est pré-configuré.
          Cliquez sur « Générer » pour lancer la planification.
        </p>
      </header>

      <PlanGenerator />

      <ChargePlanner />
    </div>
  );
}
