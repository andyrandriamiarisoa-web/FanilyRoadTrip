/**
 * `DebugModeToggle` — active/désactive le mode debug (local, jamais envoyé).
 * Quand actif, le carnet expose un bouton « Télécharger le journal de debug »
 * regroupant tous les inputs/outputs ayant servi à composer le voyage.
 */
"use client";

import { useSyncExternalStore } from "react";
import {
  isDebugMode,
  setDebugMode,
  subscribeDebugMode,
} from "@/lib/debug/debug-mode";

export function DebugModeToggle() {
  const enabled = useSyncExternalStore(
    subscribeDebugMode,
    isDebugMode,
    () => false,
  );

  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
        Mode debug
      </h2>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDebugMode(e.target.checked)}
          className="w-5 h-5 mt-0.5 shrink-0"
          aria-label="Activer le mode debug"
        />
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Affiche dans le carnet un bouton <strong>« Télécharger le journal de
          debug »</strong> — un fichier JSON regroupant la saisie, la requête
          envoyée au moteur (synthèse ou IA), les candidats / le brouillon
          produits, le carnet final et les recherches de dispos hôtel. Utile
          pour diagnostiquer un résultat inattendu. Tout reste local.
        </span>
      </label>
      {enabled && (
        <p className="text-xs" style={{ color: "var(--accent-success)" }}>
          Mode debug actif — ouvrez le carnet pour télécharger le journal.
        </p>
      )}
    </section>
  );
}
