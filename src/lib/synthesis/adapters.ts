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

export interface SynthesisAdapters {
  travel: TravelTimeProvider;
  canicule: CaniculeProvider;
  events?: EventsProvider;
}
