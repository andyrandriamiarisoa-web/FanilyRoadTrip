import type { SynthesisAdapters, TravelTimeProvider, CaniculeProvider } from "./adapters";
import type { LatLng } from "./types";
import { haversineKm } from "./solver";
import { getEventsProvider } from "@/lib/providers/events";

// === INTÉGRATION — relie aux modules livrés en R1–R6 ===
//  • durées réalistes : src/lib/routing/realistic-time.ts (estimateRealisticLeg :
//    OSRM ×1.08 + marge trafic + pauses + recharges). On l'alimente avec une
//    distance routière estimée (détour ×1.25 sur la distance à vol d'oiseau).
//  • vigilance chaleur : couche météo (src/lib/providers/weather.ts) → heatwave.
import { estimateRealisticLeg } from "@/lib/routing/realistic-time";
import { getWeather } from "@/lib/providers/weather";

/** Détour routier moyen vs distance à vol d'oiseau. */
const ROAD_DETOUR_FACTOR = 1.25;
/** Vitesse moyenne fluide (km/h) pour estimer le temps libre OSRM-like. */
const AVG_FREEFLOW_KMH = 105;

const travel: TravelTimeProvider = {
  async estimate(from: LatLng, to: LatLng, departISO: string) {
    const roadKm = haversineKm(from, to) * ROAD_DETOUR_FACTOR;
    const freeFlowMinutes = Math.round((roadKm / AVG_FREEFLOW_KMH) * 60);
    const leg = estimateRealisticLeg({
      distanceKm: roadKm,
      freeFlowMinutes,
      date: departISO.slice(0, 10),
      // Le solveur insère lui-même les pauses bébé → on ne les compte pas ici
      // (sinon double comptage). On garde conduite + marge trafic.
      babyOnboard: false,
      isEv: true,
    });
    return {
      minutes: leg.drivingMinutes + leg.trafficMarginMinutes,
      chargeStops: Math.floor(roadKm / 250),
      sourceStatus: "estimated",
    };
  },
};

// Mémoïsation : la synthèse interroge la météo de très nombreuses fois
// (candidats × cadran de dates × jours). On déduplique par (lat,lng,date).
const heatCache = new Map<string, Promise<boolean>>();

const canicule: CaniculeProvider = {
  isHeatAlert(location: LatLng, dateISO: string): Promise<boolean> {
    const key = `${location.lat.toFixed(2)},${location.lng.toFixed(2)},${dateISO}`;
    const hit = heatCache.get(key);
    if (hit) return hit;
    const p = (async () => {
      try {
        const w = await getWeather({ lat: location.lat, lng: location.lng, date: dateISO });
        return w.heatwave;
      } catch {
        return false;
      }
    })();
    heatCache.set(key, p);
    return p;
  },
};

export function createSynthesisAdapters(): SynthesisAdapters {
  return { travel, canicule, events: getEventsProvider() };
}
