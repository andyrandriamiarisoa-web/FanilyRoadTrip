import { z } from "zod"

// ---------------------------------------------------------------------------
// Source status
// ---------------------------------------------------------------------------

export const SourceStatusSchema = z.enum(["seed", "estimated", "verified"])
export type SourceStatus = z.infer<typeof SourceStatusSchema>

// ---------------------------------------------------------------------------
// Vehicle profile
// ---------------------------------------------------------------------------

export const VehicleProfileSchema = z.object({
  model: z.string(),
  usableKwh: z.number(),
  baseConsumptionWh100km: z.number(),
  highwayFactor: z.number(),
  heatFactor: z.number(),
  maxChargingKw: z.number(),
  bufferSoc: z.number(),
  targetChargeSoc: z.number(),
  startChargeSoc: z.number(),
})
export type VehicleProfile = z.infer<typeof VehicleProfileSchema>

// ---------------------------------------------------------------------------
// Medical constraints
// ---------------------------------------------------------------------------

export const MedicalConstraintsSchema = z.object({
  requiresFirmMattress: z.boolean(),
  acRequired: z.boolean(),
})
export type MedicalConstraints = z.infer<typeof MedicalConstraintsSchema>

// ---------------------------------------------------------------------------
// Baby constraints
// ---------------------------------------------------------------------------

export const BabyConstraintsSchema = z.object({
  ageMonths: z.number(),
  maxLegMinutes: z.number(),
  noDrivingHours: z.tuple([z.number(), z.number()]),
  requiresParasolBed: z.boolean(),
  requiresAcInAccommodation: z.boolean(),
})
export type BabyConstraints = z.infer<typeof BabyConstraintsSchema>

// ---------------------------------------------------------------------------
// Work constraints
// ---------------------------------------------------------------------------

export const WorkConstraintsSchema = z.object({
  workDays: z.array(
    z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
  ),
  workStartHour: z.number(),
  workEndHour: z.number(),
  requiresDeskCm: z.number(),
  requiresFiber: z.boolean(),
  fallback5G: z.boolean(),
  lateCheckoutHour: z.number(),
})
export type WorkConstraints = z.infer<typeof WorkConstraintsSchema>

// ---------------------------------------------------------------------------
// Driving constraints
// ---------------------------------------------------------------------------

export const DrivingConstraintsSchema = z.object({
  maxSegmentMinutes: z.number(),
  noHeatDrivingRange: z.tuple([z.number(), z.number()]),
  preferredDrivingWindows: z.array(
    z.object({
      after: z.number(),
      before: z.number(),
    })
  ),
})
export type DrivingConstraints = z.infer<typeof DrivingConstraintsSchema>

// ---------------------------------------------------------------------------
// Fixed event (e.g. the wedding)
// ---------------------------------------------------------------------------

export const FixedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  hour: z.number(),
  location: z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  maxDistanceKm: z.number(),
  requiresNightBefore: z.boolean(),
})
export type FixedEvent = z.infer<typeof FixedEventSchema>

// ---------------------------------------------------------------------------
// Family profile
// ---------------------------------------------------------------------------

export const FamilyProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Incremented on every saved edit (versionné dans la base). */
  version: z.number().int().positive(),
  /** ISO timestamp of the last save. */
  updatedAt: z.string(),
  vehicle: VehicleProfileSchema,
  medical: MedicalConstraintsSchema,
  baby: BabyConstraintsSchema,
  work: WorkConstraintsSchema,
  driving: DrivingConstraintsSchema,
  avoidLargeUrbanCores: z.boolean(),
  preferPeripheryWithTransport: z.boolean(),
})
export type FamilyProfile = z.infer<typeof FamilyProfileSchema>

// ---------------------------------------------------------------------------
// Supercharger
// ---------------------------------------------------------------------------

export const SuperchargerSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  numStalls: z.number(),
  maxKw: z.number(),
  version: z.enum(["V2", "V3", "V4"]),
  sourceStatus: SourceStatusSchema,
})
export type Supercharger = z.infer<typeof SuperchargerSchema>

// ---------------------------------------------------------------------------
// Lodging option
// ---------------------------------------------------------------------------

export const LodgingOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  priceTotal: z.number(),
  nights: z.number(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  amenities: z.object({
    ac: z.boolean(),
    parking: z.boolean(),
    evCharger: z.boolean(),
    desk: z.boolean(),
    parasol: z.boolean().optional(),
    pool: z.boolean().optional(),
  }),
  toConfirm: z.array(z.enum(["firmMattress", "desk32", "lateCheckout", "babyBed"])),
  sourceStatus: SourceStatusSchema,
  bookingLinks: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
      })
    )
    .optional(),
  tier: z.enum(["eco", "best", "character"]),
  score: z.number().optional(),
  scoreBreakdown: z.record(z.string(), z.number()).optional(),
})
export type LodgingOption = z.infer<typeof LodgingOptionSchema>

// ---------------------------------------------------------------------------
// Charge stop
// ---------------------------------------------------------------------------

export const ChargeStopSchema = z.object({
  superchargerId: z.string(),
  superchargerName: z.string(),
  lat: z.number(),
  lng: z.number(),
  socOnArrival: z.number(),
  socOnDeparture: z.number(),
  chargeMinutes: z.number(),
  energyAddedKwh: z.number(),
})
export type ChargeStop = z.infer<typeof ChargeStopSchema>

// ---------------------------------------------------------------------------
// Leg (route segment between stops)
// ---------------------------------------------------------------------------

export const LegSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
  distanceKm: z.number(),
  durationMinutes: z.number(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  chargeStops: z.array(ChargeStopSchema),
  socOnArrival: z.number(),
  consumptionKwh: z.number(),
  warnings: z.array(z.string()),
})
export type Leg = z.infer<typeof LegSchema>

// ---------------------------------------------------------------------------
// Day plan
// ---------------------------------------------------------------------------

export const DayPlanSchema = z.object({
  date: z.string(),
  type: z.enum(["drive", "work", "rest", "event", "charge-only"]),
  location: z.string(),
  leg: LegSchema.optional(),
  events: z.array(FixedEventSchema).optional(),
  lodging: LodgingOptionSchema.optional(),
  workStatus: z.enum(["full", "partial", "none"]).optional(),
  notes: z.array(z.string()),
  heatAdvisory: z.boolean().optional(),
  connectivity: z
    .object({
      quality: z.enum(["excellent", "good", "fair", "poor"]),
      note: z.string(),
    })
    .optional(),
})
export type DayPlan = z.infer<typeof DayPlanSchema>

// ---------------------------------------------------------------------------
// 5G coverage entry
// ---------------------------------------------------------------------------

export const Coverage5GSchema = z.object({
  commune: z.string(),
  operator: z.literal("SFR"),
  quality: z.enum(["insufficient", "fair", "good", "excellent"]),
  antennasCount: z.number().optional(),
  estimatedMbps: z.number().optional(),
  sourceStatus: SourceStatusSchema,
  verifyUrl: z.string().optional(),
})
export type Coverage5G = z.infer<typeof Coverage5GSchema>

// ---------------------------------------------------------------------------
// Trip plan (the full generated plan)
// ---------------------------------------------------------------------------

export const TripPlanSchema = z.object({
  id: z.string(),
  version: z.number(),
  createdAt: z.string(),
  profileId: z.string(),
  tripRequest: z.object({
    origin: z.string(),
    originLat: z.number(),
    originLng: z.number(),
    destination: z.string(),
    destinationLat: z.number(),
    destinationLng: z.number(),
    departureFrom: z.string(),
    departureTo: z.string(),
    maxDays: z.number(),
    fixedEvents: z.array(FixedEventSchema),
  }),
  days: z.array(DayPlanSchema),
  totalDistanceKm: z.number(),
  totalDrivingMinutes: z.number(),
  lodgingSelections: z.record(z.string(), z.string()),
  budgetEstimate: z.object({
    lodgingTotal: z.number(),
    chargingTotal: z.number(),
  }),
  feasible: z.boolean(),
  conflicts: z.array(z.string()),
  agentLog: z
    .array(
      z.object({
        agent: z.string(),
        input: z.unknown(),
        output: z.unknown(),
        durationMs: z.number(),
      })
    )
    .optional(),
})
export type TripPlan = z.infer<typeof TripPlanSchema>

// ---------------------------------------------------------------------------
// Trip request input
// ---------------------------------------------------------------------------

export const TripRequestSchema = z.object({
  origin: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destination: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  departureFrom: z.string(),
  departureTo: z.string(),
  maxDays: z.number(),
  fixedEvents: z.array(FixedEventSchema),
  profileId: z.string().optional(),
})
export type TripRequest = z.infer<typeof TripRequestSchema>
