import { NextResponse } from "next/server"
import { AvailabilityRequestSchema } from "@/lib/lodging/availability/types"
import { searchAvailabilityWithFallback } from "@/lib/lodging/availability"

/**
 * Recherche de **disponibilité hôtels** (Lot R5) — read-only strict.
 * Mock par défaut ; LiteAPI sandbox ou Hotelbeds (env. de test) en live, avec
 * repli mock honnête. Aucun endpoint de réservation/paiement n'est exposé.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = AvailabilityRequestSchema.parse(body)
    const result = await searchAvailabilityWithFallback(parsed)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ ok: false, error: "Données invalides" }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : "Erreur interne"
    console.error("[api/lodging/availability]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
