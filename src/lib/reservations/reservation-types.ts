/**
 * Import des réservations (M8) — schémas & définition d'outil.
 *
 * L'utilisateur colle une confirmation (e-mail / texte) ; on en **extrait**
 * une réservation structurée, agrégée dans l'itinéraire par date. Extraction
 * **déterministe** par défaut (heuristiques), ou IA (`claude-sonnet-4-6`,
 * forced tool use) en mode LIVE — validée par Zod.
 */

import { z } from "zod"

export const RESERVATION_TYPES = [
  "lodging",
  "train",
  "flight",
  "car",
  "activity",
  "other",
] as const

export type ReservationType = (typeof RESERVATION_TYPES)[number]

export const RESERVATION_TYPE_LABELS: Record<ReservationType, string> = {
  lodging: "Hébergement",
  train: "Train",
  flight: "Vol",
  car: "Location voiture",
  activity: "Activité",
  other: "Autre",
}

/** Brouillon extrait (sans id ni horodatage). */
export const ReservationDraftSchema = z.object({
  type: z.enum(RESERVATION_TYPES),
  title: z.string().min(1),
  provider: z.string().optional(),
  confirmationNumber: z.string().optional(),
  /** Date de début, YYYY-MM-DD. */
  startDate: z.string(),
  /** Date de fin optionnelle (séjour), YYYY-MM-DD. */
  endDate: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
})
export type ReservationDraft = z.infer<typeof ReservationDraftSchema>

/** Réservation persistée. */
export const ReservationSchema = ReservationDraftSchema.extend({
  id: z.string(),
  importedAt: z.string(),
})
export type Reservation = z.infer<typeof ReservationSchema>

export const ReservationImportRequestSchema = z.object({
  text: z.string().min(1).max(8_000),
})
export type ReservationImportRequest = z.infer<typeof ReservationImportRequestSchema>

// ---------------------------------------------------------------------------
// Outil Anthropic — force une extraction JSON conforme
// ---------------------------------------------------------------------------

export const RESERVATION_TOOL_NAME = "extraire_reservation"

export const reservationTool = {
  name: RESERVATION_TOOL_NAME,
  description:
    "Extrait une réservation structurée à partir d'un e-mail ou texte de " +
    "confirmation (hébergement, train, vol, location, activité).",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: [...RESERVATION_TYPES],
        description: "Type de réservation.",
      },
      title: { type: "string", description: "Intitulé court (ex. « Hôtel le Chapeau Rouge »)." },
      provider: { type: "string", description: "Prestataire / plateforme (Booking, SNCF…)." },
      confirmationNumber: { type: "string", description: "Numéro de confirmation / référence." },
      startDate: { type: "string", description: "Date de début au format YYYY-MM-DD." },
      endDate: { type: "string", description: "Date de fin au format YYYY-MM-DD (le cas échéant)." },
      location: { type: "string", description: "Lieu / ville / adresse." },
      notes: { type: "string", description: "Informations utiles (horaires, voie, chambre…)." },
    },
    required: ["type", "title", "startDate"],
  },
}
