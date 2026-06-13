/**
 * Orchestrateur d'extraction de réservation (M8).
 *
 * Mock par défaut : extraction déterministe par heuristiques (`parseReservation`).
 * Mode LIVE (`NEXT_PUBLIC_APP_MODE=live` + `ANTHROPIC_API_KEY`) : Claude
 * (`claude-sonnet-4-6`) en forced tool use, sortie validée Zod, repli propre
 * sur l'extraction déterministe en cas d'erreur. Clé API serveur uniquement.
 */

import {
  ReservationDraftSchema,
  RESERVATION_TOOL_NAME,
  reservationTool,
  type ReservationDraft,
} from "./reservation-types"
import { parseReservation } from "./reservation-parse"

const MODEL = "claude-sonnet-4-6"

export interface ReservationExtractionResult {
  draft: ReservationDraft
  source: "mock" | "ai"
}

export async function extractReservation(text: string): Promise<ReservationExtractionResult> {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  if (!isLive || !process.env.ANTHROPIC_API_KEY) {
    return { draft: parseReservation(text), source: "mock" }
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1_024,
      system:
        "Tu extrais une réservation structurée à partir d'un e-mail de " +
        "confirmation. Les dates doivent être au format YYYY-MM-DD. Appelle " +
        `l'outil ${RESERVATION_TOOL_NAME}.`,
      tools: [reservationTool],
      tool_choice: { type: "tool", name: RESERVATION_TOOL_NAME },
      messages: [{ role: "user", content: text }],
    })

    const toolUse = response.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> =>
        block.type === "tool_use" && block.name === RESERVATION_TOOL_NAME,
    )
    if (!toolUse) throw new Error("Aucun appel d'outil")

    const parsed = ReservationDraftSchema.safeParse(toolUse.input)
    if (!parsed.success) throw new Error("Sortie IA invalide")
    return { draft: parsed.data, source: "ai" }
  } catch (err) {
    console.warn("[reservation-ai] Repli sur l'extraction déterministe :", err instanceof Error ? err.message : err)
    return { draft: parseReservation(text), source: "mock" }
  }
}
