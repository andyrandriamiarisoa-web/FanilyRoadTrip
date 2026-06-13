/**
 * Fusion des contraintes (M5) — types.
 *
 * Transforme une séquence de conduite + recharges (issue du `RoutePlanner`)
 * en une **chronologie heure par heure** respectant, par ordre de priorité :
 *   1. Sécurité/charge (déjà garantie par M4).
 *   2. Bébé : pause ≤ maxLegMinutes, idéalement alignée sur une recharge ;
 *      blocage de conduite 12h–16h en canicule.
 *   3. Télétravail : pas de conduite pendant les heures ouvrées (jours travaillés).
 *
 * Les heures sont en décimal local (8.5 = 8h30).
 */

export type TimelineEventType =
  | "drive"
  | "charge"
  | "baby-pause"
  | "heat-block"
  | "work-block"

export interface TimelineEvent {
  type: TimelineEventType
  startHour: number
  endHour: number
  label: string
}

export interface TimelineLeg {
  driveMinutes: number
  toName: string
  /** Recharge à l'issue de ce segment (le cas échéant). */
  chargeMinutes?: number
  chargerName?: string
}

export interface TimelineInput {
  departureHour: number
  legs: TimelineLeg[]
  /** Durée de conduite maxi entre deux pauses bébé (minutes). */
  maxLegMinutes: number
  /** Durée d'une pause bébé (minutes). */
  babyPauseMinutes?: number
  /** Fenêtre de blocage canicule [début, fin] si canicule ce jour, sinon null. */
  heatWindow?: [number, number] | null
  /** Fenêtre de télétravail [début, fin] si jour travaillé, sinon null. */
  workWindow?: [number, number] | null
  /** Heure au-delà de laquelle on bascule sur une nuitée (défaut 22h). */
  dayEndHour?: number
}

export interface TimelineResult {
  events: TimelineEvent[]
  /** Heure de fin (arrivée) dans la journée. */
  endHour: number
  /** True si toute la conduite tient dans la journée sans débordement. */
  feasibleWithinDay: boolean
  conflicts: string[]
  babyPauseCount: number
  totalDriveMinutes: number
  totalBlockedMinutes: number
}
