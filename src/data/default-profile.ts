import type { FamilyProfile } from "@/types"

/**
 * Profil Foyer de référence (Annexe A / §4 du brief).
 *
 * Sert de graine au premier lancement : il est copié dans IndexedDB puis
 * devient éditable et versionné. Les valeurs reflètent les contraintes
 * réelles du foyer (Tesla Model S Raven, bébé 6 mois, spondylarthrite,
 * télétravail lun–jeu).
 *
 * Toute heure est exprimée en heures décimales (8.5 = 8h30).
 */
export const DEFAULT_FAMILY_PROFILE: FamilyProfile = {
  id: "famille-default",
  name: "Profil foyer",
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  vehicle: {
    model: "Tesla Model S Raven",
    usableKwh: 95,
    // Consommation réelle (pas EPA) : ~18,5 kWh/100 km en mixte, ~24 kWh/100 km
    // sur autoroute à 130 km/h, ~26 kWh/100 km en canicule (clim).
    baseConsumptionWh100km: 18500,
    highwayFactor: 1.32,
    heatFactor: 1.08,
    maxChargingKw: 250,
    bufferSoc: 0.12,
    targetChargeSoc: 0.8,
    startChargeSoc: 0.9,
  },
  medical: {
    requiresFirmMattress: true,
    acRequired: true,
  },
  baby: {
    ageMonths: 6,
    maxLegMinutes: 120,
    noDrivingHours: [12, 16],
    requiresParasolBed: true,
    requiresAcInAccommodation: true,
  },
  work: {
    workDays: ["monday", "tuesday", "wednesday", "thursday"],
    workStartHour: 8.5,
    workEndHour: 19,
    requiresDeskCm: 120,
    requiresFiber: true,
    fallback5G: true,
    lateCheckoutHour: 11,
    allowSharedOffice: true,
    maxOfficeMinutesSkateboard: 10,
  },
  driving: {
    maxSegmentMinutes: 140,
    noHeatDrivingRange: [12, 16],
    preferredDrivingWindows: [{ after: 19, before: 22 }],
  },
  avoidLargeUrbanCores: true,
  preferPeripheryWithTransport: true,
}
