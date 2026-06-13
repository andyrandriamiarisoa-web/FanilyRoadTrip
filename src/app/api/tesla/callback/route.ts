import { NextResponse, type NextRequest } from "next/server"
import {
  discoverRegionBaseUrl,
  exchangeCodeForTokens,
  getTeslaOAuthConfig,
} from "@/lib/vehicle/tesla-oauth"
import {
  TESLA_SESSION_COOKIE,
  TESLA_SESSION_MAX_AGE_SECONDS,
  encryptSession,
  sessionCookieOptions,
  verifySignedState,
  type TeslaSession,
} from "@/lib/vehicle/tesla-session"

/**
 * URI de redirection OAuth Tesla. Vérifie le `state` **signé** (HMAC, sans
 * cookie), échange le `code` contre des jetons, découvre la base régionale,
 * chiffre la session dans un cookie httpOnly, puis renvoie l'utilisateur vers
 * /parametres avec un statut clair.
 */
export const runtime = "nodejs"

function redirectToSettings(origin: string, status: "connected" | "error", reason?: string) {
  const url = new URL("/parametres", origin)
  url.searchParams.set("tesla", status)
  if (reason) url.searchParams.set("reason", reason)
  return url
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const config = getTeslaOAuthConfig()
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const fail = (reason: string) =>
    NextResponse.redirect(redirectToSettings(url.origin, "error", reason))

  if (!config) return fail("config")
  if (!code || !verifySignedState(state)) return fail("state")

  try {
    const tokens = await exchangeCodeForTokens({ code, config })
    const baseUrl = await discoverRegionBaseUrl({
      accessToken: tokens.accessToken,
      baseUrlHint: process.env.TESLA_FLEET_API_BASE,
    })
    const session: TeslaSession = { ...tokens, baseUrl }
    const encrypted = encryptSession(session)
    if (!encrypted) return fail("secret") // TESLA_TOKEN_SECRET manquant

    const res = NextResponse.redirect(redirectToSettings(url.origin, "connected"))
    res.cookies.set(
      TESLA_SESSION_COOKIE,
      encrypted,
      sessionCookieOptions(TESLA_SESSION_MAX_AGE_SECONDS),
    )
    return res
  } catch (err) {
    console.error("[tesla/callback]", err instanceof Error ? err.message : err)
    return fail("exchange")
  }
}
