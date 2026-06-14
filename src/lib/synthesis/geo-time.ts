/**
 * Helpers **purs** géo + calendrier, partagés par le cœur de synthèse
 * (`solver.ts`, `optimizer.ts`, `date-flex.ts`). Source unique → pas de
 * divergence entre modules. Heures en minutes depuis minuit, dates ISO
 * `YYYY-MM-DD`, jours de semaine 1=lundi…7=dimanche.
 */

import type { LatLng } from "./types";

/** Distance à vol d'oiseau (km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Projection scalaire de `p` sur l'axe `a→b`, normalisée 0..1. */
export function projection(p: LatLng, a: LatLng, b: LatLng): number {
  const ax = b.lng - a.lng, ay = b.lat - a.lat;
  const px = p.lng - a.lng, py = p.lat - a.lat;
  const denom = ax * ax + ay * ay || 1;
  return Math.max(0, Math.min(1, (px * ax + py * ay) / denom));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

/** Datetime ISO à `minutes` depuis minuit (UTC) du jour `dateISO`. */
export function isoDateTime(dateISO: string, minutes: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCMinutes(minutes);
  return d.toISOString();
}

/** Jour de semaine 1=lundi … 7=dimanche. */
export function weekday(dateISO: string): number {
  const day = new Date(dateISO + "T00:00:00Z").getUTCDay();
  return day === 0 ? 7 : day;
}

/** "08:30" → 510 (minutes depuis minuit). */
export function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
