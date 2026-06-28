/**
 * Mode debug — drapeau local (localStorage) qui expose les outils de
 * diagnostic dans l'UI (ex. téléchargement du journal de création du carnet).
 *
 * 100 % client, aucune donnée envoyée. Le drapeau est lu via
 * `useSyncExternalStore` pour réagir aux changements sans recharger la page.
 */

const KEY = "odyssee-debug-mode";

export function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDebugMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
    // Notifie les abonnés (même onglet — `storage` ne se déclenche que sur les
    // autres onglets, on émet donc un événement maison).
    window.dispatchEvent(new Event("odyssee-debug-mode-change"));
  } catch {
    // Stockage indisponible (navigation privée stricte) : on ignore.
  }
}

/** S'abonne aux changements du drapeau (même onglet + autres onglets). */
export function subscribeDebugMode(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("odyssee-debug-mode-change", callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("odyssee-debug-mode-change", callback);
  };
}
