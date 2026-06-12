import type { TripRequest, TripPlan } from "@/types";
import { runMockOrchestrator } from "./mock-orchestrator";

export async function runLiveOrchestrator(request: TripRequest): Promise<TripPlan> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return runMockOrchestrator(request);
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `Tu es un orchestrateur de planification de voyage.
Tu génères un plan de voyage optimisé pour une famille avec Tesla Model S Raven, un bébé de 6 mois,
spondylarthrite (matelas ferme), et télétravail lun-jeu 8h30-19h.

Réponds UNIQUEMENT avec du JSON valide correspondant au schéma TripPlan.
Ne jamais utiliser de filtres excluants sur les hébergements — classe par score.
Chaque logement doit avoir un sourceStatus: "estimated".`;

    const userPrompt = `Génère un plan de voyage complet pour :
Départ: ${request.origin} (${request.originLat}, ${request.originLng})
Destination: ${request.destination} (${request.destinationLat}, ${request.destinationLng})
Dates: ${request.departureFrom} au ${request.departureTo}
Durée max: ${request.maxDays} jours
Événements fixes: ${JSON.stringify(request.fixedEvents)}

Retourne un TripPlan JSON complet avec tous les champs.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Response non-text");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed as TripPlan;
  } catch {
    console.warn("[live-orchestrator] Claude API failed, falling back to mock");
    return runMockOrchestrator(request);
  }
}
