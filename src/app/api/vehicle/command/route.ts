import { NextResponse, type NextRequest } from "next/server"
import { getVehicleProviderForRequest } from "@/lib/vehicle/provider"
import { VehicleCommandSchema, VehicleNotFoundError } from "@/lib/vehicle/types"
import {
  TESLA_SESSION_COOKIE,
  TESLA_SESSION_MAX_AGE_SECONDS,
  encryptSession,
  sessionCookieOptions,
} from "@/lib/vehicle/tesla-session"

/**
 * Envoie une commande à un véhicule. Corps : `{ vehicleId, command }`.
 * Côté serveur uniquement ; le résultat est toujours explicite (succès ou
 * raison réelle de l'échec, y compris l'exigence de commandes signées).
 */
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON invalide." }, { status: 400 })
  }

  const body = payload as { vehicleId?: unknown; command?: unknown }
  const parsed = VehicleCommandSchema.safeParse(body?.command)
  if (typeof body?.vehicleId !== "string" || !body.vehicleId || !parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Requête invalide : vehicleId et command sont requis." },
      { status: 400 },
    )
  }

  const raw = req.cookies.get(TESLA_SESSION_COOKIE)?.value
  const resolved = await getVehicleProviderForRequest(raw)
  if ("needsAuth" in resolved) {
    return NextResponse.json({ ok: false, needsAuth: true, error: "Connexion Tesla requise." })
  }

  try {
    const result = await resolved.provider.sendCommand(body.vehicleId, parsed.data)
    const res = NextResponse.json({ ok: result.ok, mode: resolved.provider.mode, result })
    if (resolved.refreshedSession) {
      const enc = encryptSession(resolved.refreshedSession)
      if (enc) {
        res.cookies.set(TESLA_SESSION_COOKIE, enc, sessionCookieOptions(TESLA_SESSION_MAX_AGE_SECONDS))
      }
    }
    return res
  } catch (err) {
    if (err instanceof VehicleNotFoundError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 404 })
    }
    const message = err instanceof Error ? err.message : "Erreur véhicule"
    console.error("[vehicle/command]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
