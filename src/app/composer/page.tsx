import type { Metadata } from "next";
import { Composer } from "@/components/synthesis/Composer";

export const metadata: Metadata = {
  title: "Composer un voyage",
};

export default function ComposerPage() {
  return (
    <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Composer un voyage
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          À partir d&apos;une ancre (un événement à date fixe), de vos envies et du Profil Foyer,
          Odyssée compose plusieurs voyages élégants — dates de début et de fin comprises.
        </p>
      </header>

      <Composer />
    </div>
  );
}
