/**
 * Génération d'itinéraire par IA (M7) — schémas & définition d'outil.
 *
 * L'utilisateur décrit son voyage en texte libre ; l'IA (API Anthropic,
 * `claude-sonnet-4-6`) propose un itinéraire **structuré** respectant le
 * Profil Foyer. La sortie est garantie en JSON via **forced tool use** puis
 * validée par Zod. Mode MOCK déterministe sans clé API.
 */

import { z } from "zod"

/**
 * Données de trajet calculées côté serveur — jamais produites par le LLM.
 * Renseignées par `attachRealisticLegs` après génération du brouillon.
 */
export const RealisticLegSchema = z.object({
  /** Libellé du trajet tel que fourni par le LLM (ex. « Paris → Marseille »). */
  fromTo: z.string(),
  distanceKm: z.number(),
  drivingMinutes: z.number(),
  trafficMarginMinutes: z.number(),
  pauseMinutes: z.number(),
  chargingMinutes: z.number(),
  totalMinutes: z.number(),
  /** Origine de la donnée de routage (OSRM live → verified, seed → seed, haversine → estimated). */
  source: z.enum(["verified", "seed", "estimated"]),
  trafficNote: z.string(),
})
export type RealisticLeg = z.infer<typeof RealisticLegSchema>

export const AiItineraryDaySchema = z.object({
  date: z.string(),
  title: z.string(),
  /** Description optionnelle d'un trajet (ex. « Dijon → Mâcon »). */
  drivingFromTo: z.string().optional(),
  activities: z.array(z.string()),
  /** Type d'hébergement à rechercher pour la nuit. */
  lodgingHint: z.string(),
  /** Comment les contraintes du foyer ont façonné cette journée. */
  constraintNotes: z.array(z.string()),
  /**
   * Durée de trajet réaliste calculée côté serveur (jamais produite par le LLM).
   * Présente uniquement si `drivingFromTo` est renseigné et le géocodage a réussi.
   */
  leg: RealisticLegSchema.optional(),
})
export type AiItineraryDay = z.infer<typeof AiItineraryDaySchema>

export const AiItineraryDraftSchema = z.object({
  destination: z.string(),
  summary: z.string(),
  days: z.array(AiItineraryDaySchema).min(1),
  constraintsApplied: z.array(z.string()),
})
export type AiItineraryDraft = z.infer<typeof AiItineraryDraftSchema>

// ---------------------------------------------------------------------------
// Requête (frontière API)
// ---------------------------------------------------------------------------

export const AiItineraryRequestSchema = z.object({
  description: z.string().min(1).max(2_000),
  destination: z.string().min(1).max(120),
  dateFrom: z.string(),
  dateTo: z.string(),
  /** Contraintes lisibles (issues du Profil Foyer) — prompt + affichage. */
  constraints: z.array(z.string()).default([]),
  /** Jours travaillés (pour la logique télétravail du mock). */
  workDays: z.array(z.string()).default([]),
})
export type AiItineraryRequest = z.infer<typeof AiItineraryRequestSchema>

// ---------------------------------------------------------------------------
// Outil Anthropic — force une sortie JSON conforme au schéma
// ---------------------------------------------------------------------------

export const ITINERARY_TOOL_NAME = "proposer_itineraire"

/** Définition d'outil (JSON Schema) miroir d'`AiItineraryDraftSchema`. */
export const itineraryTool = {
  name: ITINERARY_TOOL_NAME,
  description:
    "Propose un itinéraire de voyage familial structuré, jour par jour, " +
    "respectant strictement les contraintes du foyer.",
  input_schema: {
    type: "object" as const,
    properties: {
      destination: { type: "string", description: "Destination principale du voyage." },
      summary: { type: "string", description: "Résumé en 1–2 phrases de l'itinéraire." },
      days: {
        type: "array",
        description: "Une entrée par journée du voyage.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date au format YYYY-MM-DD." },
            title: { type: "string", description: "Titre court de la journée." },
            drivingFromTo: {
              type: "string",
              description: "Trajet du jour, ex. « Dijon → Mâcon » (vide si pas de conduite).",
            },
            activities: {
              type: "array",
              items: { type: "string" },
              description: "Activités suggérées, adaptées à un bébé.",
            },
            lodgingHint: {
              type: "string",
              description: "Type d'hébergement à rechercher (matelas ferme + clim, bureau si télétravail).",
            },
            constraintNotes: {
              type: "array",
              items: { type: "string" },
              description: "Comment les contraintes du foyer ont façonné la journée.",
            },
          },
          required: ["date", "title", "activities", "lodgingHint", "constraintNotes"],
        },
      },
      constraintsApplied: {
        type: "array",
        items: { type: "string" },
        description: "Liste des contraintes du foyer effectivement honorées.",
      },
    },
    required: ["destination", "summary", "days", "constraintsApplied"],
  },
}
