/**
 * Géocodage de villes françaises pour l'enrichissement d'itinéraire (M7).
 *
 * - `parseDrivingFromTo` : découpe une chaîne "Ville A → Ville B"
 * - `geocodeCity`        : lookup déterministe dans la table seed (sans réseau)
 * - `geocodeCityLive`    : Nominatim en mode LIVE, repli seed sinon
 *
 * Pur et testable : aucun effet de bord dans `geocodeCity`.
 */

import { FRENCH_CITIES } from "@/data/cities"

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise un nom de ville pour la recherche : minuscules, sans accents,
 * sans tirets (remplacés par espace), trim.
 */
export function normalizeCity(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les diacritiques
    .replace(/[-_]/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Parsing "Ville A → Ville B"
// ---------------------------------------------------------------------------

/**
 * Découpe une description de trajet en deux villes.
 * Accepte : « → », « -> », « à » (non-ambiguë), tiret double « — ».
 * Retire les parenthèses et leur contenu (ex. « (retour) »).
 *
 * Retourne `null` si la chaîne ne ressemble pas à un trajet A→B.
 */
export function parseDrivingFromTo(
  text: string,
): { from: string; to: string } | null {
  if (!text || text.trim() === "") return null

  // Retire les parenthèses et leur contenu
  const cleaned = text.replace(/\([^)]*\)/g, "").trim()

  // Séparateurs reconnus (par ordre de priorité)
  const separators = [" → ", " -> ", " — ", "→", "->", " à "]

  for (const sep of separators) {
    const idx = cleaned.indexOf(sep)
    if (idx === -1) continue
    const from = cleaned.slice(0, idx).trim()
    const to = cleaned.slice(idx + sep.length).trim()
    if (from.length > 0 && to.length > 0) {
      return { from, to }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Géocodage seed (déterministe)
// ---------------------------------------------------------------------------

export interface SeedGeoResult {
  lat: number
  lng: number
  source: "seed"
}

/**
 * Cherche une ville dans la table embarquée.
 * Déterministe — aucun réseau.
 */
export function geocodeCity(name: string): SeedGeoResult | null {
  const normalized = normalizeCity(name)
  for (const city of FRENCH_CITIES) {
    if (normalizeCity(city.name) === normalized) {
      return { lat: city.lat, lng: city.lng, source: "seed" }
    }
  }
  // Essai partiel : la table contient le nom
  for (const city of FRENCH_CITIES) {
    if (normalizeCity(city.name).includes(normalized) || normalized.includes(normalizeCity(city.name))) {
      return { lat: city.lat, lng: city.lng, source: "seed" }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Géocodage live (Nominatim) avec repli seed
// ---------------------------------------------------------------------------

export interface LiveGeoResult {
  lat: number
  lng: number
  source: "verified" | "seed"
}

/**
 * Géocode un nom de ville.
 * - Mode LIVE (`NEXT_PUBLIC_APP_MODE === "live"`) : tente Nominatim d'abord
 *   (source "verified"), repli sur la table seed sinon.
 * - Mode MOCK : table seed uniquement (source "seed").
 *
 * Ne remonte jamais d'exception.
 */
export async function geocodeCityLive(name: string): Promise<LiveGeoResult | null> {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"

  if (isLive) {
    try {
      const encoded = encodeURIComponent(name)
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=fr&limit=1&q=${encoded}`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: {
          "User-Agent": "Odyssee-RoadTrip-App/1.0 (contact: famille@odyssee.app)",
        },
      })
      if (res.ok) {
        const data = (await res.json()) as Array<{ lat: string; lon: string }>
        if (data.length > 0) {
          const first = data[0]
          return {
            lat: parseFloat(first.lat),
            lng: parseFloat(first.lon),
            source: "verified",
          }
        }
      }
    } catch {
      // Repli seed
    }
  }

  const seed = geocodeCity(name)
  if (seed) return seed
  return null
}
