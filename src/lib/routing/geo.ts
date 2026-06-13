/**
 * Utilitaires géographiques pour le routage (purs, sans dépendance).
 */

const EARTH_RADIUS_KM = 6_371
/** Détour route vs ligne droite (cohérent avec le provider de routing). */
export const ROAD_FACTOR = 1.25

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export interface LatLng {
  lat: number
  lng: number
}

/** Distance grand-cercle (km) entre deux points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Distance routière estimée (km) = grand-cercle × facteur de détour. */
export function roadDistanceKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * ROAD_FACTOR
}
