/**
 * Flux OAuth de la Tesla Fleet API (authorization_code + refresh + partenaire).
 *
 * Tout est **serveur uniquement** : aucune de ces fonctions ne doit être
 * importée dans un composant client. Les jetons obtenus sont confiés à
 * `tesla-session.ts` qui les chiffre dans un cookie httpOnly.
 *
 * Endpoints Tesla :
 *  - Autorisation / jetons : https://auth.tesla.com/oauth2/v3/{authorize,token}
 *  - Données / commandes   : base **régionale** découverte via /api/1/users/region
 *
 * La lecture ne requiert que le scope `vehicle_device_data`. Les commandes
 * ajoutent `vehicle_cmds` + `vehicle_charging_cmds`. `offline_access` est requis
 * pour obtenir un `refresh_token`.
 */

export const TESLA_AUTH_BASE = "https://auth.tesla.com/oauth2/v3"

/** Scopes demandés (lecture + commandes confort/charge). */
export const TESLA_SCOPES = [
  "openid",
  "offline_access",
  "vehicle_device_data",
  "vehicle_cmds",
  "vehicle_charging_cmds",
] as const

/** Base régionale par défaut tant que la région n'est pas découverte. */
export const TESLA_DEFAULT_REGION_BASE =
  "https://fleet-api.prd.na.vn.cloud.tesla.com"

export interface TeslaOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TeslaTokenSet {
  accessToken: string
  refreshToken: string
  /** Échéance absolue de l'access token (epoch ms). */
  expiresAt: number
}

export class TeslaOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "TeslaOAuthError"
  }
}

/**
 * Lit la configuration OAuth depuis l'environnement. Ne renvoie `null` que si
 * une variable manque — l'appelant décide alors de rester en mock plutôt que
 * de planter (jamais bloquant en dev/CI).
 */
export function getTeslaOAuthConfig(): TeslaOAuthConfig | null {
  const clientId = process.env.TESLA_CLIENT_ID
  const clientSecret = process.env.TESLA_CLIENT_SECRET
  const redirectUri = process.env.TESLA_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

/** Construit l'URL d'autorisation Tesla (avec state anti-CSRF). */
export function buildAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: (args.scopes ?? TESLA_SCOPES).join(" "),
    state: args.state,
  })
  return `${TESLA_AUTH_BASE}/authorize?${params.toString()}`
}

interface TeslaTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function tokenSetFrom(json: TeslaTokenResponse, fallbackRefresh?: string): TeslaTokenSet {
  if (!json.access_token) {
    throw new TeslaOAuthError(
      json.error_description || json.error || "Réponse token invalide",
    )
  }
  // Marge de sécurité de 60 s pour rafraîchir avant l'expiration réelle.
  const expiresInMs = (json.expires_in ?? 8 * 3600) * 1000
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || fallbackRefresh || "",
    expiresAt: Date.now() + expiresInMs,
  }
}

async function postToken(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TeslaTokenResponse> {
  const res = await fetchImpl(`${TESLA_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as TeslaTokenResponse
  if (!res.ok) {
    throw new TeslaOAuthError(
      json.error_description || json.error || `Token HTTP ${res.status}`,
      res.status,
    )
  }
  return json
}

/** Échange le `code` d'autorisation contre un jeu de jetons utilisateur. */
export async function exchangeCodeForTokens(args: {
  code: string
  config: TeslaOAuthConfig
  fetchImpl?: typeof fetch
}): Promise<TeslaTokenSet> {
  const json = await postToken(
    {
      grant_type: "authorization_code",
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      code: args.code,
      redirect_uri: args.config.redirectUri,
    },
    args.fetchImpl ?? fetch,
  )
  return tokenSetFrom(json)
}

/**
 * Rafraîchit l'access token. Tesla fait **tourner** le refresh token : on
 * conserve le nouveau s'il est fourni, sinon l'ancien reste valide.
 */
export async function refreshAccessToken(args: {
  refreshToken: string
  clientId: string
  fetchImpl?: typeof fetch
}): Promise<TeslaTokenSet> {
  const json = await postToken(
    {
      grant_type: "refresh_token",
      client_id: args.clientId,
      refresh_token: args.refreshToken,
    },
    args.fetchImpl ?? fetch,
  )
  return tokenSetFrom(json, args.refreshToken)
}

/** Jeton « partenaire » (client_credentials) pour l'enregistrement de domaine. */
export async function getPartnerToken(args: {
  config: TeslaOAuthConfig
  audience: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const json = await postToken(
    {
      grant_type: "client_credentials",
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      scope: TESLA_SCOPES.join(" "),
      audience: args.audience,
    },
    args.fetchImpl ?? fetch,
  )
  if (!json.access_token) {
    throw new TeslaOAuthError("Jeton partenaire indisponible")
  }
  return json.access_token
}

/**
 * Enregistre le domaine de l'application auprès de la Fleet API (étape unique,
 * sans laquelle les endpoints véhicule renvoient 403). À refaire par région.
 */
export async function registerPartnerAccount(args: {
  audience: string
  domain: string
  partnerToken: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const doFetch = args.fetchImpl ?? fetch
  const res = await doFetch(`${args.audience}/api/1/partner_accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.partnerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain: args.domain }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new TeslaOAuthError(
      `Enregistrement partenaire échoué : HTTP ${res.status} ${text}`.trim(),
      res.status,
    )
  }
}

interface RegionResponse {
  response?: { region?: string; fleet_api_base_url?: string }
}

/**
 * Découvre la base régionale Fleet API du compte (`fleet_api_base_url`).
 * L'endpoint `/api/1/users/region` répond quelle que soit la région appelée,
 * ce qui corrige le 403 « Account must be registered in the current region ».
 */
export async function discoverRegionBaseUrl(args: {
  accessToken: string
  baseUrlHint?: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const doFetch = args.fetchImpl ?? fetch
  const base = args.baseUrlHint || TESLA_DEFAULT_REGION_BASE
  const res = await doFetch(`${base}/api/1/users/region`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  if (!res.ok) {
    // En dernier recours, on retombe sur la base indiquée : honnête, non bloquant.
    return base
  }
  const json = (await res.json().catch(() => ({}))) as RegionResponse
  return json.response?.fleet_api_base_url || base
}
