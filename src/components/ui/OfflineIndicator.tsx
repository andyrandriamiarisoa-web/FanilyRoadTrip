"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Suit l'état de connexion via `navigator.onLine` + événements online/offline.
 * `useSyncExternalStore` évite tout setState d'effet et gère le rendu serveur
 * (en ligne par défaut côté serveur).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Bandeau discret affiché uniquement hors-ligne : rassure l'utilisateur que
 * ses données restent consultables (offline-first).
 */
export function OfflineIndicator() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full text-center text-xs font-semibold py-1 px-3"
      style={{ background: "var(--accent-warning)", color: "var(--text-on-amber)" }}
    >
      Hors ligne — votre carnet, budget, bagages et votes restent disponibles
    </div>
  );
}
