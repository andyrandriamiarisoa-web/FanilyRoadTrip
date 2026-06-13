/**
 * Disponibilité hors-ligne (M9) — logique pure et testée.
 *
 * L'app est *offline-first* : le shell est précaché (Serwist), les tuiles OSM
 * en cache-first, et toutes les données du voyage vivent dans IndexedDB. Ce
 * module décrit ce qui reste consultable sans réseau, pour informer
 * honnêtement l'utilisateur.
 */

export interface OfflineFeature {
  key: string
  label: string
  /** Disponible hors-ligne (données locales ou shell précaché). */
  available: boolean
}

/** Fonctions consultables sans réseau (données IndexedDB + pages précachées). */
export const OFFLINE_FEATURES: OfflineFeature[] = [
  { key: "carnet", label: "Carnet de route", available: true },
  { key: "budget", label: "Budget & dépenses", available: true },
  { key: "bagages", label: "Liste de bagages", available: true },
  { key: "reservations", label: "Réservations", available: true },
  { key: "vote", label: "Vote des activités", available: true },
  { key: "carte", label: "Cartes d'étape (SVG)", available: true },
]

/** Génération d'itinéraire IA : nécessite le réseau (API serveur). */
export const ONLINE_ONLY_FEATURES: OfflineFeature[] = [
  { key: "ia", label: "Génération d'itinéraire par IA", available: false },
  { key: "tuiles-live", label: "Cartes en ligne haute résolution", available: false },
]

export interface OfflineReadiness {
  online: boolean
  statusLabel: string
  /** True si au moins une fonctionnalité reste utilisable hors-ligne. */
  usableOffline: boolean
  features: OfflineFeature[]
}

export function describeOfflineReadiness(online: boolean): OfflineReadiness {
  return {
    online,
    statusLabel: online
      ? "En ligne"
      : "Hors ligne — vos données restent disponibles",
    usableOffline: OFFLINE_FEATURES.some((f) => f.available),
    features: OFFLINE_FEATURES,
  }
}
