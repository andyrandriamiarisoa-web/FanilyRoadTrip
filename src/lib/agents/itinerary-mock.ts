/**
 * Générateur d'itinéraire MOCK (M7) — déterministe, sans réseau.
 *
 * Produit un brouillon d'itinéraire structuré à partir de la description et
 * des dates, en intégrant les contraintes du foyer (télétravail lun–jeu,
 * pauses bébé, hébergement matelas ferme + clim). Aucun hasard : la même
 * entrée produit toujours la même sortie (testable).
 */

import type { AiItineraryDraft, AiItineraryDay, AiItineraryRequest } from "./itinerary-types"

const WEEKDAY_INDEX_TO_KEY = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

const LEISURE_ACTIVITIES = [
  "Balade tranquille en centre-ville (ombragée)",
  "Visite d'un parc ou jardin adapté à la poussette",
  "Marché local et déjeuner en terrasse",
  "Musée climatisé (sieste bébé possible)",
  "Découverte d'un site historique à rythme calme",
  "Temps de repos à l'hébergement + piscine si disponible",
]

const MAX_DAYS = 21

/** Itère les dates de `from` à `to` inclus (cap à MAX_DAYS). */
function dateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [from]
  }
  const out: string[] = []
  const cursor = new Date(start)
  while (cursor <= end && out.length < MAX_DAYS) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

function weekdayKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return WEEKDAY_INDEX_TO_KEY[d.getUTCDay()] ?? "monday"
}

export function generateMockItinerary(req: AiItineraryRequest): AiItineraryDraft {
  const dates = dateRange(req.dateFrom, req.dateTo)
  const workDays = new Set(req.workDays)

  const days: AiItineraryDay[] = dates.map((date, i) => {
    const isWorkDay = workDays.has(weekdayKey(date))
    const constraintNotes: string[] = []

    constraintNotes.push("Pauses bébé toutes les 90–120 min")
    constraintNotes.push("Pas de conduite 12h–16h en cas de canicule")

    let activities: string[]
    let lodgingHint: string
    let title: string

    if (isWorkDay) {
      title = `Journée workation à ${req.destination}`
      activities = [
        "Télétravail 8h30–19h (poste de travail conforme requis)",
        "Sortie en fin de journée après 19h",
        LEISURE_ACTIVITIES[i % LEISURE_ACTIVITIES.length],
      ]
      lodgingHint = "Hébergement workation : bureau ≥ 120 cm, fibre + 5G SFR, matelas ferme, climatisation"
      constraintNotes.push("Jour travaillé : pas de longue conduite en heures ouvrées")
    } else {
      title = `Découverte à ${req.destination}`
      activities = [
        LEISURE_ACTIVITIES[i % LEISURE_ACTIVITIES.length],
        LEISURE_ACTIVITIES[(i + 2) % LEISURE_ACTIVITIES.length],
      ]
      lodgingHint = "Hébergement confort : matelas ferme, climatisation, lit bébé"
    }

    return { date, title, activities, lodgingHint, constraintNotes }
  })

  const constraintsApplied = req.constraints.length
    ? req.constraints
    : [
        "Tesla Model S Raven — Superchargeurs uniquement",
        "Bébé — pauses régulières, pas de conduite 12h–16h en canicule",
        "Médical — matelas ferme + climatisation à chaque nuitée",
        "Télétravail lun–jeu — hébergement workation-ready",
      ]

  return {
    destination: req.destination,
    summary:
      `Itinéraire de ${days.length} jour${days.length > 1 ? "s" : ""} vers ${req.destination}, ` +
      "calé sur les contraintes du foyer (bébé, médical, télétravail) — brouillon éditable.",
    days,
    constraintsApplied,
  }
}
