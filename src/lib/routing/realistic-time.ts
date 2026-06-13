/**
 * Estimation de durée de trajet réaliste (M7).
 *
 * Transforme un temps de parcours fluide (OSRM, sans trafic) en durée
 * réelle tenant compte de :
 *   1. Coefficient conduite réelle (+8 %)
 *   2. Marge trafic saisonnière/journalière (heuristique historique)
 *   3. Pauses bébé (~15 min / 2 h de conduite)
 *   4. Arrêts de recharge Tesla (~25 min / 250 km)
 *
 * Pur, déterministe, testé unitairement — aucune dépendance réseau.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RealisticLegArgs {
  distanceKm: number
  /** Durée fluide (sans trafic) renvoyée par OSRM ou la seed table, en min. */
  freeFlowMinutes: number
  /** Date au format YYYY-MM-DD — pour calculer mois/jour de semaine. */
  date: string
  babyOnboard: boolean
  isEv: boolean
}

export interface RealisticLeg {
  distanceKm: number
  /** Temps de conduite réelle (freeFlow × 1,08). */
  drivingMinutes: number
  /** Supplément trafic historique. */
  trafficMarginMinutes: number
  /** Pauses bébé (15 min / 2 h de conduite). */
  pauseMinutes: number
  /** Arrêts Supercharge (~25 min / 250 km). */
  chargingMinutes: number
  /** Total = conduite + trafic + pauses + recharge. */
  totalMinutes: number
  /** Note lisible en français sur le trafic estimé. */
  trafficNote: string
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Coefficient conduite réelle vs fluide OSRM. */
const REAL_DRIVING_FACTOR = 1.08

/** Marge trafic maximale (plafond absolu). */
const MAX_TRAFFIC_RATIO = 0.40

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse une date YYYY-MM-DD sans se fier à `new Date()` en local —
 * on force l'interprétation UTC pour éviter les décalages horaires.
 */
function parseDateUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1))
}

/**
 * Calcule la marge trafic en fraction de `drivingMinutes`.
 * Heuristique gratuite façon « trafic historique Google départ futur ».
 */
function trafficRatio(date: string): { ratio: number; note: string } {
  const d = parseDateUtc(date)
  const month = d.getUTCMonth() + 1  // 1–12
  const dow = d.getUTCDay()           // 0 = dimanche, 6 = samedi

  let ratio = 0.05  // Base : +5 %

  const isSummer = month === 7 || month === 8   // juillet ou août
  const isSaturday = dow === 6
  const isFriday = dow === 5
  const isSunday = dow === 0

  // Majoration saisonnière
  if (isSummer) ratio += 0.15  // été : départs / arrivées vacanciers

  // Majoration journalière
  if (isSaturday) ratio += 0.15        // samedi : pic de départs/retours
  else if (isFriday) ratio += 0.08     // vendredi : départs week-end
  else if (isSunday) ratio += 0.08     // dimanche : retours

  // Plafond
  ratio = Math.min(ratio, MAX_TRAFFIC_RATIO)

  // Note lisible
  const pct = Math.round(ratio * 100)
  let note: string
  if (ratio <= 0.05) {
    note = "Trafic fluide estimé"
  } else {
    const parts: string[] = []
    if (isSummer) parts.push("trafic estival")
    if (isSaturday) parts.push("samedi")
    else if (isFriday) parts.push("vendredi soir")
    else if (isSunday) parts.push("dimanche retour")
    note = parts.length > 0
      ? `Trafic chargé (${parts.join(", ")}) : +${pct} % estimé`
      : `Trafic modéré : +${pct} % estimé`
  }

  return { ratio, note }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Formate une durée en minutes en « X h YY » ou « YY min ».
 * Exemples : 370 → « 6 h 10 », 45 → « 45 min ».
 */
export function formatHm(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/**
 * Calcule une durée de trajet réaliste à partir du temps fluide OSRM.
 *
 * @param args - Paramètres de calcul (cf. `RealisticLegArgs`)
 * @returns Ventilation complète de la durée
 */
export function estimateRealisticLeg(args: RealisticLegArgs): RealisticLeg {
  const { distanceKm, freeFlowMinutes, date, babyOnboard, isEv } = args

  // 1. Conduite réelle
  const drivingMinutes = Math.round(freeFlowMinutes * REAL_DRIVING_FACTOR)

  // 2. Marge trafic
  const { ratio, note } = trafficRatio(date)
  const trafficMarginMinutes = Math.round(drivingMinutes * ratio)

  // 3. Pauses bébé : ~15 min toutes les 2 h de conduite
  const pauseMinutes = babyOnboard
    ? Math.ceil(drivingMinutes / 120) * 15
    : 0

  // 4. Arrêts Supercharge : ~25 min / 250 km
  const chargingMinutes = isEv
    ? Math.floor(distanceKm / 250) * 25
    : 0

  const totalMinutes = drivingMinutes + trafficMarginMinutes + pauseMinutes + chargingMinutes

  return {
    distanceKm,
    drivingMinutes,
    trafficMarginMinutes,
    pauseMinutes,
    chargingMinutes,
    totalMinutes,
    trafficNote: note,
  }
}
