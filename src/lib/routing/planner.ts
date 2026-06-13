/**
 * `SeedRoutePlanner` — moteur de routage charge-aware déterministe.
 *
 * Stratégie (gloutonne « plus loin atteignable ») :
 *  1. Sélectionner les Superchargeurs proches de l'axe origine→destination,
 *     ordonnés par avancement le long du corridor.
 *  2. Parcourir le corridor en transportant le SoC courant. Si la destination
 *     est atteignable avec le SoC d'arrivée cible → terminer.
 *  3. Sinon, charger au Superchargeur **le plus loin atteignable** (sans
 *     descendre sous le buffer), jusqu'à juste assez pour l'étape suivante,
 *     plafonné à `maxChargeSocPct` (~80 %, préservation batterie).
 *  4. Si aucun Superchargeur n'est atteignable et la destination non plus →
 *     trajet infaisable, signalé honnêtement (jamais masqué).
 */

import { calculateChargeMinutes } from "@/lib/charging/model"
import SUPERCHARGERS from "@/data/superchargers.json"
import { roadDistanceKm, type LatLng } from "./geo"
import {
  DEFAULT_VEHICLE_PARAMS,
  type ChargerCandidate,
  type RouteChargeStop,
  type RoutePlanRequest,
  type RoutePlanResult,
  type RoutePlanner,
  type RouteSegment,
  type VehicleParams,
} from "./types"

/**
 * Détour maximal toléré (km) : surcoût d'un arrêt = d(O→C)+d(C→D)−d(O→D).
 * Robuste aux coudes autoroutiers (contrairement à l'écart perpendiculaire
 * à la corde droite, qui sous-estime un itinéraire comme l'A6/A7).
 */
const MAX_CORRIDOR_DETOUR_KM = 60
/** Vitesse moyenne de conduite (km/h) pour estimer la durée. */
const AVG_SPEED_KMH = 105

const SEED_CHARGERS = SUPERCHARGERS as unknown as ChargerCandidate[]

export class SeedRoutePlanner implements RoutePlanner {
  readonly mode = "seed" as const

  plan(req: RoutePlanRequest): RoutePlanResult {
    const v: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS, ...req.vehicle }
    const whKm = effectiveConsumptionWhKm(v, req.isHeatwave ?? false)
    const kwhPerKm = whKm / 1_000

    const chargers = orderedCorridorChargers(
      req.origin,
      req.destination,
      req.chargers ?? SEED_CHARGERS,
    )

    const segments: RouteSegment[] = []
    const chargeStops: RouteChargeStop[] = []
    const conflicts: string[] = []

    let current: LatLng & { name: string } = { ...req.origin }
    let currentProgress = 0
    let socPct = req.startSocPct
    const consumedPctForKm = (km: number) => (km * kwhPerKm) / v.usableKwh * 100

    const MAX_ITERS = chargers.length + 2
    let feasible = true

    for (let iter = 0; iter <= MAX_ITERS; iter++) {
      // Peut-on rejoindre directement la destination ?
      const distToDest = roadDistanceKm(current, req.destination)
      const socAtDest = socPct - consumedPctForKm(distToDest)

      if (socAtDest >= req.targetArrivalSocPct) {
        segments.push(
          driveSegment(current, req.destination, distToDest, socPct, socAtDest, kwhPerKm),
        )
        socPct = socAtDest
        current = { ...req.destination }
        break
      }

      // Sélection du Supercharger le plus loin atteignable en avant du corridor.
      const ahead = chargers.filter((c) => c.progress > currentProgress + 1e-6)
      const reachable = ahead.filter(
        (c) => socPct - consumedPctForKm(roadDistanceKm(current, c)) >= v.bufferSocPct,
      )

      if (reachable.length === 0) {
        // Aucun chargeur atteignable. Si la destination reste atteignable
        // au-dessus du buffer, on finit (sous la cible), sinon infaisable.
        if (socAtDest >= v.bufferSocPct) {
          segments.push(
            driveSegment(current, req.destination, distToDest, socPct, socAtDest, kwhPerKm),
          )
          socPct = socAtDest
          current = { ...req.destination }
          conflicts.push(
            `Arrivée à ${Math.round(socAtDest)} % seulement (cible ${req.targetArrivalSocPct} %) — aucun Supercharger atteignable pour recharger davantage.`,
          )
        } else {
          feasible = false
          conflicts.push(
            `Trajet infaisable : aucun Supercharger atteignable avant d'atteindre le seuil de sécurité (${v.bufferSocPct} %).`,
          )
        }
        break
      }

      // Plus loin atteignable = avancement maximal.
      const next = reachable.reduce((best, c) => (c.progress > best.progress ? c : best))
      const driveKm = roadDistanceKm(current, next)
      const arrivalSoc = socPct - consumedPctForKm(driveKm)

      segments.push(driveSegment(current, next, driveKm, socPct, arrivalSoc, kwhPerKm))

      // Charge : juste assez pour l'étape suivante, plafonné à maxChargeSocPct.
      const distNextToDest = roadDistanceKm(next, req.destination)
      const socNeededForDest =
        consumedPctForKm(distNextToDest) + req.targetArrivalSocPct
      const departureSoc = Math.min(
        v.maxChargeSocPct,
        Math.max(socNeededForDest, v.bufferSocPct + 10),
      )

      const chargeMinutes = calculateChargeMinutes({
        startSoc: arrivalSoc / 100,
        targetSoc: departureSoc / 100,
        maxKw: Math.min(next.maxKw, v.maxChargingKw),
        usableKwh: v.usableKwh,
      })
      const energyAddedKwh =
        Math.max(0, (departureSoc - arrivalSoc) / 100) * v.usableKwh

      chargeStops.push({
        superchargerId: next.id,
        superchargerName: next.name,
        lat: next.lat,
        lng: next.lng,
        maxKw: next.maxKw,
        version: next.version,
        socOnArrivalPct: round1(arrivalSoc),
        socOnDeparturePct: round1(departureSoc),
        chargeMinutes,
        energyAddedKwh: round1(energyAddedKwh),
        precondition: true,
        sourceStatus: next.sourceStatus,
      })

      socPct = departureSoc
      current = { name: next.name, lat: next.lat, lng: next.lng }
      currentProgress = next.progress

      if (iter === MAX_ITERS) {
        feasible = false
        conflicts.push("Trajet infaisable : trop d'arrêts de charge nécessaires.")
      }
    }

    const totalDistanceKm = round1(segments.reduce((s, x) => s + x.distanceKm, 0))
    const totalDrivingMinutes = segments.reduce((s, x) => s + x.durationMinutes, 0)
    const totalChargingMinutes = chargeStops.reduce((s, x) => s + x.chargeMinutes, 0)
    const arrivalSocPct = round1(socPct)

    return {
      segments,
      chargeStops,
      totalDistanceKm,
      totalDrivingMinutes,
      totalChargingMinutes,
      startSocPct: req.startSocPct,
      startSocSource: req.startSocSource,
      arrivalSocPct,
      targetArrivalSocPct: req.targetArrivalSocPct,
      arrivalMeetsTarget: feasible && arrivalSocPct >= req.targetArrivalSocPct,
      feasible,
      conflicts,
      superchargersOnly: true,
    }
  }
}

/** Instance partagée (sans état). */
export const seedRoutePlanner = new SeedRoutePlanner()

// ── Helpers ───────────────────────────────────────────────────────────────

function effectiveConsumptionWhKm(v: VehicleParams, isHeatwave: boolean): number {
  // Conduite inter-cités → facteur autoroute toujours appliqué.
  let whKm = v.baseConsumptionWhKm * v.highwayFactor
  if (isHeatwave) whKm *= v.heatFactor
  return whKm
}

interface OrderedCharger extends ChargerCandidate {
  progress: number
}

function orderedCorridorChargers(
  origin: LatLng,
  destination: LatLng,
  candidates: ChargerCandidate[],
): OrderedCharger[] {
  const dOD = roadDistanceKm(origin, destination)
  if (dOD === 0) return []
  return candidates
    .map((c) => {
      const dOC = roadDistanceKm(origin, c)
      const dCD = roadDistanceKm(c, destination)
      const extraKm = dOC + dCD - dOD
      // `progress` = avancement le long de la route réelle (0 à l'origine,
      // 1 à destination), utilisé par le glouton pour n'aller que vers l'avant.
      return { ...c, progress: dOC / dOD, extraKm }
    })
    .filter((c) => c.extraKm <= MAX_CORRIDOR_DETOUR_KM && c.progress > 0 && c.progress < 1)
    .sort((a, b) => a.progress - b.progress)
}

function driveSegment(
  from: { name: string },
  to: { name: string },
  distanceKm: number,
  startSocPct: number,
  endSocPct: number,
  kwhPerKm: number,
): RouteSegment {
  return {
    fromName: from.name,
    toName: to.name,
    distanceKm: round1(distanceKm),
    durationMinutes: Math.round((distanceKm / AVG_SPEED_KMH) * 60),
    startSocPct: round1(startSocPct),
    endSocPct: round1(endSocPct),
    consumptionKwh: round1(distanceKm * kwhPerKm),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
