import type { Metadata } from "next";
import { SavedTripsList } from "@/components/voyages/SavedTripsList";

export const metadata: Metadata = {
  title: "Mes voyages",
};

export default function VoyagesPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Mes voyages
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Tous vos voyages enregistrés — brouillons en cours, voyages envoyés
          au carnet, archives. Cliquez sur <strong>Ouvrir</strong> pour
          reprendre l’édition (formulaire pré-rempli, résultat précédent
          restauré) ou <strong>Rafraîchir les dispos hôtel</strong> pour
          rappeler le fournisseur sandbox sur chaque nuit du carnet.
        </p>
      </header>

      <SavedTripsList />
    </div>
  );
}
