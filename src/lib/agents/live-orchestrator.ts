import type { TripRequest, TripPlan } from "@/types"
import { TripPlanSchema } from "@/types"
import { runMockOrchestrator } from "./mock-orchestrator"

export async function runLiveOrchestrator(request: TripRequest): Promise<TripPlan> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return runMockOrchestrator(request)
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `Tu es un orchestrateur de planification de voyage familial expert.
Tu génères un plan de voyage optimisé pour une famille avec :
- Tesla Model S Raven (95 kWh, Superchargeurs uniquement, 185 Wh/km)
- Bébé 6 mois (pauses toutes les 90–120 min, pas de conduite 12h–16h en canicule)
- Spondylarthrite (matelas ferme obligatoire, climatisation)
- Télétravail lun–jeu 8h30–19h (bureau ≥120 cm, fibre + 5G SFR)

RÈGLES ABSOLUES :
1. Ne jamais filtrer les hébergements — classer par score, jamais éliminer
2. sourceStatus obligatoire : "seed" | "estimated" | "verified" sur chaque donnée
3. Chaque leg doit avoir des chargeStops si la distance > 200 km
4. Respecter les fenêtres de conduite (pas de conduite 12h–16h en canicule)
5. Jours de télétravail lun–jeu : workStatus "full" si pas de déplacement

Réponds UNIQUEMENT avec du JSON valide correspondant au schéma TripPlan.`

    const userPrompt = `Génère un plan de voyage complet JSON pour :
Départ : ${request.origin} (${request.originLat}, ${request.originLng})
Destination : ${request.destination} (${request.destinationLat}, ${request.destinationLng})
Dates : ${request.departureFrom} → ${request.departureTo}
Durée max : ${request.maxDays} jours
Événements fixes : ${JSON.stringify(request.fixedEvents, null, 2)}

Le plan doit couvrir tous les jours du ${request.departureFrom} au ${request.departureTo}.
Retourne un objet TripPlan JSON complet, valide, sans texte autour.`

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16_384,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== "text") throw new Error("Response non-text")

    // Extract JSON — handle markdown code blocks
    const jsonMatch =
      content.text.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      content.text.match(/(\{[\s\S]*\})/)
    if (!jsonMatch) throw new Error("No JSON found in response")

    const raw = JSON.parse(jsonMatch[1] ?? jsonMatch[0])

    // Validate against schema — fall back on parse error
    const parsed = TripPlanSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn(
        "[live-orchestrator] Schema validation failed:",
        parsed.error.issues.slice(0, 3)
      )
      throw new Error("TripPlan schema validation failed")
    }

    return parsed.data
  } catch (err) {
    console.warn("[live-orchestrator] Falling back to mock:", err)
    return runMockOrchestrator(request)
  }
}
