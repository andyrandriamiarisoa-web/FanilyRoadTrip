import { NextResponse, type NextRequest } from "next/server"
import { getVehicleProviderForRequest } from "@/lib/vehicle/provider"
import {
  TESLA_SESSION_COOKIE,
  TESLA_SESSION_MAX_AGE_SECONDS,
  encryptSession,
  sessionCookieOptions,
} from "@/lib/vehicle/tesla-session"

/**
 * Liste les véhicules du compte connecté (mock par défaut, Tesla via la
 * session OAuth). Côté serveur uniquement : aucun token n'est exposé au client.
 * En mode live non connecté → `needsAuth:true` pour déclencher l'OAuth côté UI.
 */
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(TESLA_SESSION_COOKIE)?.value
  const resolved = await getVehicleProviderForRequest(raw)
  if ("needsAuth" in resolved) {
    return NextResponse.json({ ok: false, needsAuth: true, error: "Connexion Tesla requise." })
  }

  try {
    const vehicles = await resolved.provider.listVehicles()
    const res = NextResponse.json({ ok: true, mode: resolved.provider.mode, vehicles })
    if (resolved.refreshedSession) {
      const enc = encryptSession(resolved.refreshedSession)
      if (enc) {
        res.cookies.set(TESLA_SESSION_COOKIE, enc, sessionCookieOptions(TESLA_SESSION_MAX_AGE_SECONDS))
      }
    }
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur véhicule"
    console.error("[vehicle/list]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
