import { NextResponse } from "next/server"
import { getVehicleProvider, VehicleNotFoundError } from "@/lib/vehicle/provider"

/**
 * Lecture ponctuelle de l'état de charge d'un véhicule (jamais de polling).
 * `?vehicleId=...` requis. Côté serveur uniquement.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const vehicleId = url.searchParams.get("vehicleId")
  if (!vehicleId) {
    return NextResponse.json(
      { ok: false, error: "Paramètre vehicleId requis" },
      { status: 400 },
    )
  }

  try {
    const provider = getVehicleProvider()
    const state = await provider.getVehicleState(vehicleId)
    return NextResponse.json({ ok: true, mode: provider.mode, state })
  } catch (err) {
    if (err instanceof VehicleNotFoundError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 404 })
    }
    const message = err instanceof Error ? err.message : "Erreur véhicule"
    console.error("[vehicle/state]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
