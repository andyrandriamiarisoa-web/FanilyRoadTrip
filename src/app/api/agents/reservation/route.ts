import { NextResponse } from "next/server"
import { ReservationImportRequestSchema } from "@/lib/reservations/reservation-types"
import { extractReservation } from "@/lib/reservations/reservation-ai"

/**
 * Extrait une réservation structurée depuis un texte de confirmation collé.
 * Mock-first (heuristiques) ; Claude en mode LIVE. Clé API côté serveur.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { text } = ReservationImportRequestSchema.parse(body)
    const { draft, source } = await extractReservation(text)
    return NextResponse.json({ ok: true, source, draft })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Données invalides", details: err.message },
        { status: 400 },
      )
    }
    const message = err instanceof Error ? err.message : "Erreur interne"
    console.error("[agents/reservation]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
