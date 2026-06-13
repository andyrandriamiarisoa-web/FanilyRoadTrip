import { NextResponse } from "next/server"
import { AiItineraryRequestSchema } from "@/lib/agents/itinerary-types"
import { generateItinerary } from "@/lib/agents/itinerary-ai"

/**
 * Génère un brouillon d'itinéraire structuré à partir d'une description
 * en texte libre + des contraintes du Profil Foyer. Mock-first ; Claude
 * en mode LIVE. La clé API reste côté serveur.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const request = AiItineraryRequestSchema.parse(body)
    const { draft, source } = await generateItinerary(request)
    return NextResponse.json({ ok: true, source, draft })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Données invalides", details: err.message },
        { status: 400 },
      )
    }
    const message = err instanceof Error ? err.message : "Erreur interne"
    console.error("[agents/itinerary]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
