import type { LatLng, SourceStatus, Opportunity } from "./types";

export interface TravelTimeProvider {
  estimate(from: LatLng, to: LatLng, departISO: string):
    Promise<{ minutes: number; chargeStops: number; sourceStatus: SourceStatus }>;
}

export interface CaniculeProvider {
  isHeatAlert(location: LatLng, dateISO: string): Promise<boolean>;
}

export interface BBox { minLat: number; minLng: number; maxLat: number; maxLng: number }

export interface EventsProvider {
  search(bbox: BBox, range: { start: string; end: string }): Promise<Opportunity[]>;
}

/**
 * Géocodage inverse léger : ville connue la plus proche d'une coordonnée.
 * Sert au solveur à **nommer les étapes intermédiaires** créées quand un long
 * trajet est découpé sur plusieurs jours (la nuit se fait dans une vraie ville,
 * jamais à une coordonnée inventée dans un champ). Optionnel : sans lui, le
 * solveur retombe sur la coordonnée interpolée brute (toujours honnête, juste
 * sans nom de ville).
 */
export interface GeoProvider {
  nearestCity(loc: LatLng): { name: string; location: LatLng } | null;
}

export interface SynthesisAdapters {
  travel: TravelTimeProvider;
  canicule: CaniculeProvider;
  events?: EventsProvider;
  geo?: GeoProvider;
}
