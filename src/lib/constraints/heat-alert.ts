/**
 * Dérivation d'une **alerte chaleur** (canicule) à partir de la couche météo.
 *
 * Correctif (Lot R1) : le blocage de conduite 12h–16h n'est **pas** systématique.
 * Il ne s'applique qu'aux jours/segments effectivement sous vigilance chaleur,
 * signalée par la couche météo (Open-Meteo en LIVE, seed sinon). Pas d'alerte
 * → pas de blocage, conduite libre.
 *
 * Module **pur et déterministe** : il prend des relevés météo déjà récupérés
 * (origine, destination, arrêts de charge…) et en déduit une décision booléenne
 * accompagnée d'une explication honnête (température, lieu, source).
 */

import type { SourceStatus } from "@/lib/providers/types"

export interface WeatherReading {
  /** Nom lisible du point (ville/borne) pour l'explication. */
  name: string
  tempMaxC: number
  /** Vrai si la couche météo qualifie ce jour de canicule (≥ 36 °C). */
  heatwave: boolean
  sourceStatus: SourceStatus
}

export interface HeatAlert {
  /** Vrai si au moins un point du trajet est sous vigilance chaleur. */
  active: boolean
  /** Température maxi observée sur le trajet (null si aucun relevé). */
  maxTempC: number | null
  /** Lieu le plus chaud (null si aucun relevé). */
  hottestLocation: string | null
  /** Source du relevé le plus chaud (null si aucun relevé). */
  sourceStatus: SourceStatus | null
  /** Explication honnête, prête à afficher. */
  reason: string
}

/**
 * Déduit l'alerte chaleur d'un ensemble de relevés. L'alerte est active si
 * **au moins un** point est en canicule (vigilance par segment/jour).
 * Déterministe : aucune dépendance à l'horloge ni au réseau.
 */
export function deriveHeatAlert(readings: readonly WeatherReading[]): HeatAlert {
  if (readings.length === 0) {
    return {
      active: false,
      maxTempC: null,
      hottestLocation: null,
      sourceStatus: null,
      reason: "Aucun relevé météo — pas de blocage chaleur appliqué.",
    }
  }

  const hottest = readings.reduce((a, b) => (b.tempMaxC > a.tempMaxC ? b : a))
  const active = readings.some((r) => r.heatwave)
  const maxTempC = Math.round(hottest.tempMaxC)

  const reason = active
    ? `Vigilance chaleur : ${maxTempC} °C attendus à ${hottest.name} — conduite bloquée 12h–16h.`
    : `Pas de vigilance chaleur sur le trajet (max ${maxTempC} °C à ${hottest.name}) — conduite libre 12h–16h.`

  return {
    active,
    maxTempC,
    hottestLocation: hottest.name,
    sourceStatus: hottest.sourceStatus,
    reason,
  }
}
