import { NextResponse } from "next/server"
import { getVehicleProvider } from "@/lib/vehicle/provider"

/**
 * Liste les véhicules du compte connecté (mock par défaut, Tesla si env).
 * Côté serveur uniquement : aucun token n'est exposé au client.
 */
export async function GET() {
  try {
    const provider = getVehicleProvider()
    const vehicles = await provider.listVehicles()
    return NextResponse.json({ ok: true, mode: provider.mode, vehicles })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur véhicule"
    console.error("[vehicle/list]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
