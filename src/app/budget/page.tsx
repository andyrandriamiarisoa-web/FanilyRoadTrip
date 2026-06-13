import type { Metadata } from "next";
import { BudgetManager } from "@/components/budget/BudgetManager";

export const metadata: Metadata = {
  title: "Budget & dépenses",
};

export default function BudgetPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Budget & dépenses
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Suivi des dépenses, ventilation par poste et partage entre voyageurs.
        </p>
      </header>

      <BudgetManager />
    </div>
  );
}
