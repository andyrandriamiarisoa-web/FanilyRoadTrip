import type { Metadata } from "next";
import { ReservationsManager } from "@/components/reservations/ReservationsManager";

export const metadata: Metadata = {
  title: "Réservations",
};

export default function ReservationsPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Réservations
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Importez vos confirmations : elles sont extraites et agrégées dans l&apos;itinéraire.
        </p>
      </header>

      <ReservationsManager />
    </div>
  );
}
