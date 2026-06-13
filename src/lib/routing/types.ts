/**
 * Couche `RoutePlanner` — moteur de routage *charge-aware* (M4).
 *
 * Deuxième pilier du « moat » : planifier un trajet Tesla piloté par l'état
 * de charge, **Superchargeurs uniquement**, avec un SoC de départ (réel ou
 * cible) et un SoC d'arrivée cible, en restant dans la fenêtre batterie
 * (buffer de sécurité → charge max ~80 %).
 *
 * L'implémentation par défaut (`SeedRoutePlanner`) est **déterministe** et
 * testée sur des trajets fixtures (option B « moteur maison » du brief).
 */

import { z } from "zod"
import type { SourceStatus } from "@/lib/providers/types"

export interface GeoPoint {
  name: string
  lat: number
  lng: number
}

/** Paramètres de consommation/charge du véhicule (défauts Model S Raven). */
export interface VehicleParams {
  usableKwh: number
  /** Consommation de base en Wh/km (malgré l'historique « Wh/100km »). */
  baseConsumptionWhKm: number
  highwayFactor: number
  heatFactor: number
  maxChargingKw: number
  /** SoC plancher de sécurité, % — on ne descend jamais en dessous. */
  bufferSocPct: number
  /** SoC maximal de charge rapide, % — préserve la batterie (~80 %). */
  maxChargeSocPct: number
}

export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  usableKwh: 95,
  baseConsumptionWhKm: 185,
  highwayFactor: 1.18,
  heatFactor: 1.06,
  maxChargingKw: 250,
  bufferSocPct: 12,
  maxChargeSocPct: 80,
}

export interface ChargerCandidate {
  id: string
  name: string
  lat: number
  lng: number
  maxKw: number
  version: "V2" | "V3" | "V4"
  sourceStatus: SourceStatus
}

export interface RoutePlanRequest {
  origin: GeoPoint
  destination: GeoPoint
  /** SoC de départ, 0–100. */
  startSocPct: number
  /** Origine du SoC : lecture live du véhicule, ou cible saisie. */
  startSocSource: "live" | "target"
  /** SoC souhaité à l'arrivée, 0–100. */
  targetArrivalSocPct: number
  /** Conduite en canicule → surconsommation (clim). */
  isHeatwave?: boolean
  vehicle?: Partial<VehicleParams>
  /** Superchargeurs candidats (défaut : seed embarqué). */
  chargers?: ChargerCandidate[]
}

export interface RouteChargeStop {
  superchargerId: string
  superchargerName: string
  lat: number
  lng: number
  maxKw: number
  version: "V2" | "V3" | "V4"
  socOnArrivalPct: number
  socOnDeparturePct: number
  chargeMinutes: number
  energyAddedKwh: number
  /** Rappel : lancer la navigation Tesla pour préconditionner la batterie. */
  precondition: boolean
  sourceStatus: SourceStatus
}

export interface RouteSegment {
  fromName: string
  toName: string
  distanceKm: number
  durationMinutes: number
  startSocPct: number
  endSocPct: number
  consumptionKwh: number
}

export interface RoutePlanResult {
  segments: RouteSegment[]
  chargeStops: RouteChargeStop[]
  totalDistanceKm: number
  totalDrivingMinutes: number
  totalChargingMinutes: number
  startSocPct: number
  startSocSource: "live" | "target"
  arrivalSocPct: number
  targetArrivalSocPct: number
  arrivalMeetsTarget: boolean
  feasible: boolean
  conflicts: string[]
  /** Toujours vrai : on ne route que sur le réseau Supercharger. */
  superchargersOnly: true
}

export interface RoutePlanner {
  readonly mode: "seed"
  plan(req: RoutePlanRequest): RoutePlanResult
}

const GeoPointSchema = z.object({
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
})

/** Schéma d'entrée validé à la frontière API. */
export const RoutePlanRequestSchema = z.object({
  origin: GeoPointSchema,
  destination: GeoPointSchema,
  startSocPct: z.number().min(0).max(100),
  startSocSource: z.enum(["live", "target"]),
  targetArrivalSocPct: z.number().min(0).max(100),
  isHeatwave: z.boolean().optional(),
})

// Schéma Zod de sortie — validation aux frontières (API/persistance).
export const RouteChargeStopSchema = z.object({
  superchargerId: z.string(),
  superchargerName: z.string(),
  lat: z.number(),
  lng: z.number(),
  maxKw: z.number(),
  version: z.enum(["V2", "V3", "V4"]),
  socOnArrivalPct: z.number(),
  socOnDeparturePct: z.number(),
  chargeMinutes: z.number(),
  energyAddedKwh: z.number(),
  precondition: z.boolean(),
  sourceStatus: z.enum(["seed", "estimated", "verified"]),
})

export const RouteSegmentSchema = z.object({
  fromName: z.string(),
  toName: z.string(),
  distanceKm: z.number(),
  durationMinutes: z.number(),
  startSocPct: z.number(),
  endSocPct: z.number(),
  consumptionKwh: z.number(),
})

export const RoutePlanResultSchema = z.object({
  segments: z.array(RouteSegmentSchema),
  chargeStops: z.array(RouteChargeStopSchema),
  totalDistanceKm: z.number(),
  totalDrivingMinutes: z.number(),
  totalChargingMinutes: z.number(),
  startSocPct: z.number(),
  startSocSource: z.enum(["live", "target"]),
  arrivalSocPct: z.number(),
  targetArrivalSocPct: z.number(),
  arrivalMeetsTarget: z.boolean(),
  feasible: z.boolean(),
  conflicts: z.array(z.string()),
  superchargersOnly: z.literal(true),
})
