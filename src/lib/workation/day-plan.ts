/**
 * Orchestration des **jours de télétravail** (Lot R4) — pure et déterministe.
 *
 * Sur un jour travaillé (Lun–Jeu par défaut, paramétrable depuis le Profil
 * Foyer), le foyer libère l'hébergement pendant qu'Andy travaille. Deux besoins
 * simultanés, servis **uniquement** depuis les POI ouverts ingérés (Lot R2) :
 *
 *  1. **Coworking (priorité 1)** — un espace dédié garantit fiablement bureau +
 *     connexion + calme. On **classe par proximité + signaux de conformité**
 *     (wifi, bureau, clim) ; on **n'exclut jamais** (anti-pattern #1) — les
 *     manques (horaires inconnus…) sont signalés.
 *  2. **Plan de visites famille (priorité 2)** — activités adaptées au bébé à
 *     proximité, dimensionnées à la fenêtre de travail, respectant les pauses
 *     bébé et la **fenêtre canicule** (privilégier l'intérieur, éviter 12h–16h
 *     dehors quand une vigilance chaleur est active).
 *
 * Aucune nouvelle source de données : tout vient de `src/data/poi.json`.
 */

import type { Poi, PoiCategory } from "@/types"
import { poisNear, openStateAt, type GeoLike, type RankedPoi } from "@/lib/poi/poi"
import { ORDERED_WEEKDAYS, type Weekday } from "@/lib/profile/profile"

/** Catégories d'activités famille (hors coworking), par ordre de priorité. */
const FAMILY_CATEGORIES: readonly PoiCategory[] = [
  "museum",
  "aquarium-zoo",
  "attraction",
  "park",
  "playground",
  "family-restaurant",
]

/** Rayon de recherche par défaut (km) — atteignable sans longue conduite. */
const DEFAULT_RADIUS_KM = 15
/** Fenêtre canicule par défaut (12h–16h). */
const DEFAULT_HEAT_WINDOW: [number, number] = [12, 16]

export interface CoworkingConformity {
  /** Tous les signaux disponibles sont au vert (bureau + wifi). */
  level: "conforme" | "à confirmer"
  hasDesk: boolean
  hasWifi: boolean
  hasAc: boolean
  /** Messages honnêtes sur les manques / inconnues. */
  notes: string[]
}

export interface CoworkingOption {
  poi: RankedPoi
  conformity: CoworkingConformity
}

export type ActivityKind = "visit" | "meal" | "break"

export interface WorkationActivity {
  startHour: number
  endHour: number
  poi: RankedPoi
  kind: ActivityKind
  /** Faux si l'activité est en extérieur pendant une vigilance chaleur 12h–16h. */
  heatSafe: boolean
  notes: string[]
}

export interface WorkationDayPlan {
  /** Vrai uniquement les jours travaillés (sinon, logique non déclenchée). */
  isWorkDay: boolean
  /** Coworkings classés par proximité (jamais exclus). */
  coworking: CoworkingOption[]
  /** Plan de visites famille (peut être vide si aucune donnée dans la zone). */
  family: WorkationActivity[]
  notes: string[]
}

export interface WorkationInput {
  /** Lieu de couchage (point de référence). */
  lodging: GeoLike
  /** Date du jour (sert à dériver le jour de semaine et les horaires POI). */
  date: string
  /** Jours travaillés (Profil Foyer). */
  workDays: readonly Weekday[]
  /** Fenêtre de travail [début, fin] en heures décimales. */
  workWindow: [number, number]
  /** Vigilance chaleur active ce jour (cf. Lot R1). */
  heatAlert?: boolean
  /** Fenêtre canicule (défaut 12h–16h). */
  heatWindow?: [number, number]
  /** Rayon de recherche en km (défaut 15). */
  radiusKm?: number
  /** Jeu de POI (défaut : seed embarqué). */
  pois?: readonly Poi[]
}

/** Jour de semaine (0 = lundi) d'une date ISO `YYYY-MM-DD` (UTC, déterministe). */
export function weekdayOf(date: string): Weekday {
  const d = new Date(`${date}T00:00:00Z`)
  const idx = (d.getUTCDay() + 6) % 7
  return ORDERED_WEEKDAYS[idx]
}

export function isWorkDay(date: string, workDays: readonly Weekday[]): boolean {
  return workDays.includes(weekdayOf(date))
}

/**
 * Construit le plan d'un jour de télétravail. Renvoie un plan vide marqué
 * `isWorkDay: false` les jours non travaillés (la logique ne se déclenche pas).
 */
export function planWorkationDay(input: WorkationInput): WorkationDayPlan {
  const workDay = isWorkDay(input.date, input.workDays)
  if (!workDay) {
    return { isWorkDay: false, coworking: [], family: [], notes: [] }
  }

  const radiusKm = input.radiusKm ?? DEFAULT_RADIUS_KM
  const heatWindow = input.heatWindow ?? DEFAULT_HEAT_WINDOW
  const heatAlert = input.heatAlert ?? false
  const dayIdx = ORDERED_WEEKDAYS.indexOf(weekdayOf(input.date))

  // ── Coworking (priorité 1) ────────────────────────────────────────────────
  const coworking = poisNear({
    near: input.lodging,
    categories: ["coworking"],
    radiusKm,
    pois: input.pois,
  }).map((poi) => ({ poi, conformity: rateCoworking(poi) }))

  // ── Plan de visites famille (priorité 2) ──────────────────────────────────
  const candidates = poisNear({
    near: input.lodging,
    categories: FAMILY_CATEGORIES,
    radiusKm,
    pois: input.pois,
  })

  const family = buildFamilyPlan({
    candidates,
    workWindow: input.workWindow,
    heatAlert,
    heatWindow,
    dayIdx,
  })

  const notes: string[] = []
  if (coworking.length === 0) {
    notes.push("Aucun coworking référencé dans la zone — l'hébergement devra fournir le poste de travail.")
  }
  if (family.length === 0) {
    notes.push("Aucune activité famille référencée à proximité dans nos données ouvertes.")
  }
  if (heatAlert) {
    notes.push("Vigilance chaleur : activités d'intérieur privilégiées entre 12h et 16h.")
  }

  return { isWorkDay: true, coworking, family, notes }
}

// ── Conformité coworking ─────────────────────────────────────────────────────

function rateCoworking(poi: RankedPoi): CoworkingConformity {
  const a = poi.attributes ?? {}
  const hasDesk = a.desk === true
  const hasWifi = a.wifi === true
  const hasAc = a.ac === true
  const notes: string[] = []
  if (!hasDesk) notes.push("Bureau non confirmé")
  if (!hasWifi) notes.push("Connexion non confirmée")
  if (poi.openingHours === null) notes.push("Horaires inconnus — à vérifier")
  return {
    level: hasDesk && hasWifi ? "conforme" : "à confirmer",
    hasDesk,
    hasWifi,
    hasAc,
    notes,
  }
}

// ── Plan famille ─────────────────────────────────────────────────────────────

interface FamilyPlanInput {
  candidates: RankedPoi[]
  workWindow: [number, number]
  heatAlert: boolean
  heatWindow: [number, number]
  dayIdx: number
}

interface Slot {
  start: number
  end: number
  kind: ActivityKind
  /** Vrai si le créneau tombe dans la fenêtre canicule. */
  inHeat: boolean
  /** Catégories candidates par priorité pour ce créneau. */
  categories: readonly PoiCategory[]
  /** Exige un lieu intérieur (créneau chaud sous vigilance). */
  requireIndoor: boolean
}

/**
 * Construit une séquence d'activités sur la fenêtre de travail. Déterministe :
 * créneaux fixes, sélection du POI **le plus proche** non encore utilisé qui
 * correspond aux contraintes du créneau. On ne fabrique jamais d'activité : un
 * créneau sans POI adapté est simplement omis.
 */
function buildFamilyPlan(input: FamilyPlanInput): WorkationActivity[] {
  const [workStart, workEnd] = input.workWindow
  const [heatStart, heatEnd] = input.heatWindow
  const slots = templateSlots(workStart, workEnd, heatStart, heatEnd, input.heatAlert)

  const used = new Set<string>()
  const out: WorkationActivity[] = []

  for (const slot of slots) {
    const poi = pickForSlot(input.candidates, slot, used, input.dayIdx)
    if (!poi) continue
    used.add(poi.id)

    const heatSafe = !slot.inHeat || !input.heatAlert || isIndoor(poi)
    const notes: string[] = []
    if (poi.openingHours === null) notes.push("Horaires inconnus — à vérifier")
    else if (openStateAt(poi, input.dayIdx, slot.start) === "closed") {
      notes.push("Possible fermeture à cette heure — à vérifier")
    }
    if (!heatSafe) notes.push("Extérieur pendant la vigilance chaleur — prévoir ombre et eau")

    out.push({ startHour: slot.start, endHour: slot.end, poi, kind: slot.kind, heatSafe, notes })
  }

  return out
}

function templateSlots(
  workStart: number,
  workEnd: number,
  heatStart: number,
  heatEnd: number,
  heatAlert: boolean,
): Slot[] {
  const slots: Slot[] = []
  // Matinée (avant la fenêtre chaude) — extérieur possible.
  if (workStart < heatStart) {
    slots.push({
      start: workStart,
      end: Math.min(heatStart, 11.5),
      kind: "visit",
      inHeat: false,
      categories: ["park", "playground", "attraction", "museum", "aquarium-zoo"],
      requireIndoor: false,
    })
  }
  // Déjeuner (intérieur) — début de fenêtre chaude.
  slots.push({
    start: heatStart,
    end: heatStart + 1,
    kind: "meal",
    inHeat: true,
    categories: ["family-restaurant"],
    requireIndoor: false,
  })
  // Cœur de journée (fenêtre chaude) — intérieur privilégié si vigilance.
  slots.push({
    start: heatStart + 1,
    end: heatEnd,
    kind: "visit",
    inHeat: true,
    categories: heatAlert
      ? ["museum", "aquarium-zoo", "attraction"]
      : ["museum", "aquarium-zoo", "attraction", "park"],
    requireIndoor: heatAlert,
  })
  // Fin d'après-midi (après la chaleur) — extérieur de nouveau possible.
  if (heatEnd < workEnd) {
    slots.push({
      start: heatEnd,
      end: workEnd,
      kind: "visit",
      inHeat: false,
      categories: ["park", "playground", "attraction"],
      requireIndoor: false,
    })
  }
  return slots
}

/** Sélectionne le POI le plus proche correspondant aux contraintes du créneau. */
function pickForSlot(
  candidates: RankedPoi[],
  slot: Slot,
  used: Set<string>,
  dayIdx: number,
): RankedPoi | null {
  // Parcours par catégorie prioritaire ; à l'intérieur, déjà trié par proximité.
  for (const cat of slot.categories) {
    let fallback: RankedPoi | null = null
    for (const poi of candidates) {
      if (poi.category !== cat || used.has(poi.id)) continue
      if (slot.requireIndoor && !isIndoor(poi)) continue
      // Préférence : lieu ouvert (ou horaires inconnus) à l'heure du créneau.
      const state = openStateAt(poi, dayIdx, slot.start)
      if (state === "open" || state === "unknown") return poi
      if (!fallback) fallback = poi
    }
    if (fallback) return fallback
  }
  return null
}

function isIndoor(poi: Poi): boolean {
  return poi.attributes?.indoor === true
}
