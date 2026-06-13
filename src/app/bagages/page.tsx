import type { Metadata } from "next";
import { PackingList } from "@/components/packing/PackingList";

export const metadata: Metadata = {
  title: "Liste de bagages",
};

export default function BagagesPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Liste de bagages
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Générée automatiquement selon la durée, la saison et le bébé.
        </p>
      </header>

      <PackingList />
    </div>
  );
}
