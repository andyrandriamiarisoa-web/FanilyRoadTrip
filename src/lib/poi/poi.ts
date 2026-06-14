/**
 * Couche d'interrogation des **POI ouverts** (Lot R2) — pure et hors-ligne.
 *
 * Les POI sont ingérés une fois (Overture Maps + Foursquare OS Places, par
 * bounding box — voir `scripts/ingest-poi.md`), normalisés, validés Zod et
 * embarqués dans `src/data/poi.json`. Cette couche les interroge **localement**
 * (aucun appel réseau), ce qui la rend disponible hors-ligne.
 *
 * Principe directeur du projet : on **classe sans jamais exclure** (anti-pattern
 * #1). Les fonctions renvoient l'intégralité des POI pertinents, triés par
 * proximité ; les manques (horaires inconnus, attributs absents) sont
 * **signalés**, jamais utilisés pour filtrer. Et `sourceStatus` est toujours
 * présent (anti-pattern #3).
 */

import { PoiSchema, type Poi, type PoiCategory } from "@/types"
import RAW_POIS from "@/data/poi.json"

let cache: Poi[] | null = null

/** Charge et valide les POI embarqués (mémoïsé). */
export function loadPois(): Poi[] {
  if (cache) return cache
  cache = (RAW_POIS as unknown[]).map((p) => PoiSchema.parse(p))
  return cache
}

/** Normalise un nom de commune en clé stable (sans accents, casse, tirets). */
export function cityKeyOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, " ")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export interface GeoLike {
  lat: number
  lng: number
}

/** Distance haversine en kilomètres. */
export function haversineKm(a: GeoLike, b: GeoLike): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export interface RankedPoi extends Poi {
  /** Distance au point de référence, en km (arrondie à 0,1). */
  distanceKm: number
}

export interface PoiQuery {
  /** Point de référence (hébergement, coworking…). */
  near: GeoLike
  /** Restreint aux catégories données (sans exclure à l'intérieur). */
  categories?: readonly PoiCategory[]
  /** Rayon maximal en km (par défaut : aucun, on classe tout). */
  radiusKm?: number
  /** Nombre maximal de résultats (tri par proximité conservé). */
  limit?: number
  /** Jeu de POI à interroger (défaut : embarqué). */
  pois?: readonly Poi[]
}

/**
 * Renvoie les POI **triés par proximité** au point de référence. Ne filtre que
 * par catégorie et rayon (jamais par conformité). Déterministe : à distance
 * égale, on départage par identifiant pour un ordre stable.
 */
export function poisNear(q: PoiQuery): RankedPoi[] {
  const all = q.pois ?? loadPois()
  const cats = q.categories ? new Set(q.categories) : null

  let ranked: RankedPoi[] = all
    .filter((p) => (cats ? cats.has(p.category) : true))
    .map((p) => ({ ...p, distanceKm: round1(haversineKm(q.near, p)) }))

  if (q.radiusKm !== undefined) {
    ranked = ranked.filter((p) => p.distanceKm <= q.radiusKm!)
  }

  ranked.sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))

  return q.limit !== undefined ? ranked.slice(0, q.limit) : ranked
}

/** POI d'une commune (par clé normalisée), optionnellement filtrés par catégorie. */
export function poisInCity(
  cityName: string,
  categories?: readonly PoiCategory[],
  pois?: readonly Poi[],
): Poi[] {
  const key = cityKeyOf(cityName)
  const cats = categories ? new Set(categories) : null
  return (pois ?? loadPois()).filter(
    (p) => p.cityKey === key && (cats ? cats.has(p.category) : true),
  )
}

// ── Horaires d'ouverture ────────────────────────────────────────────────────

export type OpenState = "open" | "closed" | "unknown"

/** Jour de semaine ISO depuis une date (0 = lundi … 6 = dimanche). */
export function isoWeekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

/**
 * État d'ouverture d'un POI un jour donné (0 = lundi) à une heure décimale.
 * Renvoie `"unknown"` quand les horaires ne sont pas connus — **jamais** une
 * supposition (anti-pattern #3).
 */
export function openStateAt(poi: Poi, day: number, hourDecimal: number): OpenState {
  if (poi.openingHours === null) return "unknown"
  const periods = poi.openingHours.filter((p) => p.day === day)
  if (periods.length === 0) return "closed"
  for (const p of periods) {
    if (hourDecimal >= parseHM(p.opens) && hourDecimal < parseHM(p.closes)) return "open"
  }
  return "closed"
}

/** Libellé lisible des horaires d'un jour (« Horaires inconnus » si absent). */
export function formatHoursForDay(poi: Poi, day: number): string {
  if (poi.openingHours === null) return "Horaires inconnus"
  const periods = poi.openingHours.filter((p) => p.day === day)
  if (periods.length === 0) return "Fermé"
  return periods.map((p) => `${p.opens}–${p.closes}`).join(", ")
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number)
  return h + m / 60
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
