import type { Metadata } from "next";
import { LodgingAvailabilitySearch } from "@/components/lodging/LodgingAvailabilitySearch";

export const metadata: Metadata = {
  title: "Disponibilités hébergements",
};

export default function HebergementsPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Disponibilités hébergements
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Recherche de disponibilités et tarifs (lecture seule). Démonstration sans clé ;
          données live via LiteAPI sandbox ou Hotelbeds (env. de test) en mode live. Les
          complets restent affichés, la source et la fraîcheur sont indiquées.
        </p>
      </header>

      <LodgingAvailabilitySearch />
    </div>
  );
}
