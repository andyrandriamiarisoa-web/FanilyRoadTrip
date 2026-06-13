import { NextResponse } from "next/server"
import { seedRoutePlanner } from "@/lib/routing/planner"
import { RoutePlanRequestSchema } from "@/lib/routing/types"

/**
 * Planifie un trajet charge-aware (Superchargeurs uniquement) à partir d'un
 * SoC de départ (réel ou cible) et d'un SoC d'arrivée cible. Déterministe.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = RoutePlanRequestSchema.parse(body)
    const plan = seedRoutePlanner.plan(parsed)
    return NextResponse.json({ ok: true, mode: seedRoutePlanner.mode, plan })
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Données invalides", details: err.message },
        { status: 400 },
      )
    }
    const message = err instanceof Error ? err.message : "Erreur interne"
    console.error("[route/plan]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
