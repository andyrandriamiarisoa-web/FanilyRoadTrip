import { NextResponse } from "next/server"
import {
  TESLA_REGION_BASES,
  getTeslaOAuthConfig,
  registerPartnerAllRegions,
} from "@/lib/vehicle/tesla-oauth"

/**
 * Enregistrement **unique** du domaine de l'application auprès de la Fleet API,
 * dans **toutes les régions** (NA + EU, et la base d'env si fournie). Sans cette
 * étape — ou si elle est faite dans la mauvaise région — les endpoints véhicule
 * renvoient 403/412 (« Account must be registered in the current region »).
 *
 * Le domaine est dérivé de `TESLA_REDIRECT_URI`.
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

  let domain: string
  try {
    domain = new URL(config.redirectUri).host
  } catch {
    return NextResponse.json(
      { ok: false, error: "TESLA_REDIRECT_URI invalide." },
      { status: 400 },
    )
  }

  // Régions cibles : les bases publiques + l'éventuelle base d'environnement.
  const envBase = process.env.TESLA_FLEET_API_BASE
  const regions = envBase ? [...TESLA_REGION_BASES, envBase] : [...TESLA_REGION_BASES]

  const results = await registerPartnerAllRegions({ config, domain, regions })
  const anyOk = results.some((r) => r.ok)

  return NextResponse.json(
    { ok: anyOk, domain, regions: results },
    { status: anyOk ? 200 : 502 },
  )
}
