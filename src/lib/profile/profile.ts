/**
 * Profil Foyer — logique pure (sans IndexedDB ni React).
 *
 * Le profil est la source de vérité des contraintes du foyer (véhicule,
 * bébé, médical, télétravail, conduite). Il est éditable et versionné :
 * chaque enregistrement incrémente `version` et met à jour `updatedAt`.
 *
 * Ce module est testé unitairement et réutilisé par l'UI (écran Paramètres)
 * et par la couche de persistance (`src/lib/db.ts`).
 */

import { FamilyProfileSchema, type FamilyProfile } from "@/types"
import { DEFAULT_FAMILY_PROFILE } from "@/data/default-profile"

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Jeu",
  friday: "Ven",
  saturday: "Sam",
  sunday: "Dim",
}

/** Ordre canonique des jours, pour un affichage stable. */
export const ORDERED_WEEKDAYS: readonly Weekday[] = WEEKDAYS

/**
 * Sous-ensemble des champs réellement éditables depuis l'UI. Volontairement
 * plus restreint que `FamilyProfile` : on n'expose pas l'`id`, la `version`
 * ni l'horodatage, gérés automatiquement.
 */
export interface ProfilePatch {
  name?: string
  vehicle?: Partial<FamilyProfile["vehicle"]>
  medical?: Partial<FamilyProfile["medical"]>
  baby?: Partial<FamilyProfile["baby"]>
  work?: Partial<FamilyProfile["work"]>
  driving?: Partial<FamilyProfile["driving"]>
  avoidLargeUrbanCores?: boolean
  preferPeripheryWithTransport?: boolean
}

/** Copie profonde d'un profil de référence, prêt à être édité/persisté. */
export function createDefaultProfile(): FamilyProfile {
  return structuredCloneCompat(DEFAULT_FAMILY_PROFILE)
}

/** Valide une valeur arbitraire (ex. issue d'IndexedDB) en `FamilyProfile`. */
export function parseProfile(raw: unknown): FamilyProfile {
  return FamilyProfileSchema.parse(raw)
}

/** Valide sans lever d'exception ; renvoie `null` si invalide. */
export function safeParseProfile(raw: unknown): FamilyProfile | null {
  const result = FamilyProfileSchema.safeParse(raw)
  return result.success ? result.data : null
}

/**
 * Applique un patch partiel, incrémente la version, horodate et valide.
 * Ne mute jamais `base`. `now` est injectable pour des tests déterministes.
 */
export function updateProfile(
  base: FamilyProfile,
  patch: ProfilePatch,
  now: Date = new Date(),
): FamilyProfile {
  const next: FamilyProfile = {
    ...base,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    vehicle: { ...base.vehicle, ...patch.vehicle },
    medical: { ...base.medical, ...patch.medical },
    baby: { ...base.baby, ...patch.baby },
    work: { ...base.work, ...patch.work },
    driving: { ...base.driving, ...patch.driving },
    ...(patch.avoidLargeUrbanCores !== undefined
      ? { avoidLargeUrbanCores: patch.avoidLargeUrbanCores }
      : {}),
    ...(patch.preferPeripheryWithTransport !== undefined
      ? { preferPeripheryWithTransport: patch.preferPeripheryWithTransport }
      : {}),
    version: base.version + 1,
    updatedAt: now.toISOString(),
  }
  // La validation garantit qu'aucun patch ne casse les invariants du schéma.
  return FamilyProfileSchema.parse(next)
}

/** Heure décimale (8.5) → libellé « 8h30 ». */
export function formatDecimalHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

/** Liste ordonnée de libellés courts pour les jours travaillés. */
export function formatWorkDays(days: readonly Weekday[]): string {
  if (days.length === 0) return "Aucun"
  return ORDERED_WEEKDAYS.filter((d) => days.includes(d))
    .map((d) => WEEKDAY_LABELS[d])
    .join("–")
}

export interface ConstraintSummaryLine {
  key: string
  label: string
  value: string
  note: string
}

/**
 * Résumé lisible des contraintes, dérivé du profil courant. Source unique
 * d'affichage (écran Paramètres) et base d'explication côté planificateur.
 */
export function summarizeProfile(p: FamilyProfile): ConstraintSummaryLine[] {
  const [heatStart, heatEnd] = p.baby.noDrivingHours
  return [
    {
      key: "vehicle",
      label: "Véhicule",
      value: p.vehicle.model,
      note: "Superchargeurs uniquement",
    },
    {
      key: "baby",
      label: "Bébé",
      value: `${p.baby.ageMonths} mois`,
      note: `Pauses ≤ ${p.baby.maxLegMinutes} min · pas de conduite ${heatStart}h–${heatEnd}h en canicule`,
    },
    {
      key: "medical",
      label: "Médical",
      value: p.medical.requiresFirmMattress ? "Matelas ferme requis" : "Sans contrainte matelas",
      note: p.medical.acRequired ? "Climatisation requise" : "Climatisation optionnelle",
    },
    {
      key: "work",
      label: "Télétravail",
      value: `${formatWorkDays(p.work.workDays)} ${formatDecimalHour(
        p.work.workStartHour,
      )}–${formatDecimalHour(p.work.workEndHour)}`,
      note: `Bureau ≥ ${p.work.requiresDeskCm} cm${
        p.work.requiresFiber ? " · fibre" : ""
      }${p.work.fallback5G ? " + 5G" : ""}`,
    },
    {
      key: "driving",
      label: "Conduite",
      value: `≤ ${formatDecimalHour(p.driving.maxSegmentMinutes / 60)} par trajet`,
      note: "Le soir après les heures ouvrées les jours travaillés",
    },
  ]
}

/**
 * `structuredClone` n'est pas garanti dans tous les runtimes de test ;
 * on retombe sur une copie JSON (le profil est sérialisable).
 */
function structuredCloneCompat<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}
