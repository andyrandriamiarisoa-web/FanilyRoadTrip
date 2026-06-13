import type { Metadata } from "next";
import { PoiSearch } from "@/components/poi/PoiSearch";

export const metadata: Metadata = {
  title: "Lieux & horaires",
};

export default function LieuxPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Lieux &amp; horaires
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Coworkings, musées, parcs et activités famille des villes d&apos;étape — issus de
          jeux de données ouverts (Overture, Foursquare), consultables hors-ligne.
        </p>
      </header>

      <PoiSearch />
    </div>
  );
}
