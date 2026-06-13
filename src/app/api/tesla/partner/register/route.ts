import { NextResponse } from "next/server"
import {
  TESLA_DEFAULT_REGION_BASE,
  getPartnerToken,
  getTeslaOAuthConfig,
  registerPartnerAccount,
} from "@/lib/vehicle/tesla-oauth"

/**
 * Enregistrement **unique** du domaine de l'application auprès de la Fleet API
 * (par région). Sans cette étape, les endpoints véhicule renvoient 403
 * « Account must be registered in the current region ».
 *
 * Le domaine est dérivé de `TESLA_REDIRECT_URI`. La région cible vient de
 * `TESLA_FLEET_API_BASE` (sinon base par défaut). À appeler une fois après
 * avoir hébergé la clé publique sous /.well-known.
 */
export const runtime = "nodejs"

export async function POST() {
  const config = getTeslaOAuthConfig()
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live" || !config) {
    return NextResponse.json(
      { ok: false, error: "Indisponible (mode mock ou configuration absente)." },
      { status: 400 },
    )
  }

  const audience = process.env.TESLA_FLEET_API_BASE || TESLA_DEFAULT_REGION_BASE
  let domain: string
  try {
    domain = new URL(config.redirectUri).host
  } catch {
    return NextResponse.json(
      { ok: false, error: "TESLA_REDIRECT_URI invalide." },
      { status: 400 },
    )
  }

  try {
    const partnerToken = await getPartnerToken({ config, audience })
    await registerPartnerAccount({ audience, domain, partnerToken })
    return NextResponse.json({ ok: true, domain, audience })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur d'enregistrement"
    console.error("[tesla/partner/register]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
