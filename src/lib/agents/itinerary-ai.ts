/**
 * Orchestrateur de génération d'itinéraire (M7).
 *
 * Mode MOCK par défaut (déterministe, sans clé). Mode LIVE si
 * `NEXT_PUBLIC_APP_MODE=live` + `ANTHROPIC_API_KEY` : appelle Claude
 * (`claude-sonnet-4-6`) en **forced tool use** pour garantir une sortie JSON,
 * validée par Zod. Toute erreur (réseau, schéma) retombe proprement sur le mock.
 *
 * Après génération (chemin mock ou IA), `attachRealisticLegs` calcule côté
 * serveur la durée réaliste de chaque journée avec trajet : parsing, géocodage,
 * OSRM/seed/haversine, marges trafic/bébé/recharge. Le LLM ne produit jamais
 * de durées ni de distances.
 *
 * La clé API n'est lue que côté serveur — jamais exposée au client.
 */

import {
  AiItineraryDraftSchema,
  ITINERARY_TOOL_NAME,
  itineraryTool,
  type AiItineraryDraft,
  type AiItineraryRequest,
} from "./itinerary-types"
import { generateMockItinerary } from "./itinerary-mock"
import { attachRealisticLegs } from "./itinerary-legs"

const MODEL = "claude-sonnet-4-6"

export interface ItineraryGenerationResult {
  draft: AiItineraryDraft
  source: "mock" | "ai"
}

export async function generateItinerary(
  req: AiItineraryRequest,
): Promise<ItineraryGenerationResult> {
  const isLive = process.env.NEXT_PUBLIC_APP_MODE === "live"
  if (!isLive || !process.env.ANTHROPIC_API_KEY) {
    const draft = await attachRealisticLegs(generateMockItinerary(req), {
      babyOnboard: true,
      isEv: true,
    })
    return { draft, source: "mock" }
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const system =
      "Tu es un expert de la planification de voyages en famille. " +
      "Tu proposes des itinéraires réalistes et bienveillants pour un foyer avec :\n" +
      req.constraints.map((c) => `- ${c}`).join("\n") +
      "\n\nRÈGLES :\n" +
      "1. Respecte ces contraintes dans CHAQUE journée.\n" +
      "2. Les jours travaillés (lun–jeu) : pas de longue conduite en heures ouvrées ; " +
      "hébergement avec poste de travail conforme.\n" +
      "3. Hébergements : toujours matelas ferme + climatisation.\n" +
      "4. Rythme adapté à un bébé (pauses, pas de surcharge).\n" +
      "5. N'écris JAMAIS de distances ni de durées de trajet dans les titres ou " +
      "les activités : l'application calcule des temps réels tenant compte du trafic, " +
      "des pauses bébé et des recharges du véhicule électrique. " +
      "Garde `drivingFromTo` au format exact « Ville A → Ville B » (flèche Unicode).\n" +
      "6. Propose un rythme réaliste pour un bébé à bord d'un véhicule électrique " +
      "(pauses régulières, arrêts Supercharger intégrés, pas d'étape trop longue).\n" +
      `7. Appelle l'outil ${ITINERARY_TOOL_NAME} avec un itinéraire couvrant ` +
      `du ${req.dateFrom} au ${req.dateTo}.`

    const user =
      `Destination : ${req.destination}\n` +
      `Dates : ${req.dateFrom} → ${req.dateTo}\n\n` +
      `Description du voyage souhaité :\n${req.description}`

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8_192,
      system,
      tools: [itineraryTool],
      tool_choice: { type: "tool", name: ITINERARY_TOOL_NAME },
      messages: [{ role: "user", content: user }],
    })

    const toolUse = response.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> =>
        block.type === "tool_use" && block.name === ITINERARY_TOOL_NAME,
    )
    if (!toolUse) throw new Error("Aucun appel d'outil dans la réponse")

    const parsed = AiItineraryDraftSchema.safeParse(toolUse.input)
    if (!parsed.success) {
      throw new Error(`Sortie IA invalide : ${parsed.error.issues[0]?.message ?? "schéma"}`)
    }

    const draft = await attachRealisticLegs(parsed.data, { babyOnboard: true, isEv: true })
    return { draft, source: "ai" }
  } catch (err) {
    console.warn("[itinerary-ai] Repli sur le mock :", err instanceof Error ? err.message : err)
    const draft = await attachRealisticLegs(generateMockItinerary(req), {
      babyOnboard: true,
      isEv: true,
    })
    return { draft, source: "mock" }
  }
}
