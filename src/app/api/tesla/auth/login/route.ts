import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { buildAuthorizeUrl, getTeslaOAuthConfig } from "@/lib/vehicle/tesla-oauth"
import {
  TESLA_OAUTH_STATE_COOKIE,
  sessionCookieOptions,
} from "@/lib/vehicle/tesla-session"

/**
 * Démarre le flux OAuth Tesla : génère un `state` anti-CSRF (cookie httpOnly
 * court) et redirige vers la page de consentement Tesla. Indisponible en mode
 * mock ou si la configuration OAuth manque (jamais bloquant ailleurs).
 */
export const runtime = "nodejs"

export async function GET() {
  const config = getTeslaOAuthConfig()
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !config) {
    return NextResponse.json(
      { ok: false, error: "OAuth Tesla indisponible (mode mock ou configuration absente)." },
      { status: 400 },
    )
  }

  const state = randomBytes(16).toString("hex")
  const authorizeUrl = buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  })

  const res = NextResponse.redirect(authorizeUrl)
  res.cookies.set(TESLA_OAUTH_STATE_COOKIE, state, sessionCookieOptions(600))
  return res
}
