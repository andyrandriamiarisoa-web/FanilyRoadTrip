import { NextResponse } from "next/server"
import { buildAuthorizeUrl, getTeslaOAuthConfig } from "@/lib/vehicle/tesla-oauth"
import { createSignedState } from "@/lib/vehicle/tesla-session"

/**
 * Démarre le flux OAuth Tesla : génère un `state` anti-CSRF **signé** (HMAC,
 * sans cookie — robuste au détour cross-site/PWA iOS) et redirige vers la page
 * de consentement Tesla. Indisponible en mode mock ou si la configuration OAuth
 * (ou le secret de signature) manque — jamais bloquant ailleurs.
 */
export const runtime = "nodejs"

export async function GET() {
  const config = getTeslaOAuthConfig()
  const state = createSignedState()
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !config || !state) {
    return NextResponse.json(
      { ok: false, error: "OAuth Tesla indisponible (mode mock ou configuration absente)." },
      { status: 400 },
    )
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  })
  return NextResponse.redirect(authorizeUrl)
}
