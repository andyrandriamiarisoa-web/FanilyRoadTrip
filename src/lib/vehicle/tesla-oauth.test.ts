import { describe, it, expect } from "vitest"
import {
  buildAuthorizeUrl,
  discoverRegionBaseUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  TeslaOAuthError,
  TESLA_AUTH_BASE,
  TESLA_SCOPES,
} from "./tesla-oauth"

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://app.example/api/tesla/callback",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("buildAuthorizeUrl", () => {
  it("inclut les paramètres OAuth requis", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "xyz" }),
    )
    expect(url.origin + url.pathname).toBe(`${TESLA_AUTH_BASE}/authorize`)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("cid")
    expect(url.searchParams.get("redirect_uri")).toBe("https://app/cb")
    expect(url.searchParams.get("state")).toBe("xyz")
    expect(url.searchParams.get("scope")).toContain("vehicle_device_data")
    expect(url.searchParams.get("scope")).toBe(TESLA_SCOPES.join(" "))
  })
})

describe("exchangeCodeForTokens", () => {
  it("parse les jetons et calcule une échéance future", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 28800 })) as unknown as typeof fetch
    const before = Date.now()
    const tokens = await exchangeCodeForTokens({ code: "code", config, fetchImpl })
    expect(tokens.accessToken).toBe("a")
    expect(tokens.refreshToken).toBe("r")
    expect(tokens.expiresAt).toBeGreaterThan(before)
  })

  it("jette une TeslaOAuthError sur réponse d'erreur", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "invalid_grant", error_description: "bad code" }, 400)) as unknown as typeof fetch
    await expect(exchangeCodeForTokens({ code: "x", config, fetchImpl })).rejects.toBeInstanceOf(
      TeslaOAuthError,
    )
  })
})

describe("refreshAccessToken", () => {
  it("conserve l'ancien refresh token si Tesla n'en renvoie pas", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ access_token: "new-access", expires_in: 28800 })) as unknown as typeof fetch
    const tokens = await refreshAccessToken({ refreshToken: "old-refresh", clientId: "cid", fetchImpl })
    expect(tokens.accessToken).toBe("new-access")
    expect(tokens.refreshToken).toBe("old-refresh")
  })

  it("adopte le nouveau refresh token quand il est fourni (rotation)", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ access_token: "na", refresh_token: "nr", expires_in: 28800 })) as unknown as typeof fetch
    const tokens = await refreshAccessToken({ refreshToken: "old", clientId: "cid", fetchImpl })
    expect(tokens.refreshToken).toBe("nr")
  })
})

describe("discoverRegionBaseUrl", () => {
  it("renvoie fleet_api_base_url du compte", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        response: { region: "eu", fleet_api_base_url: "https://fleet-api.prd.eu.vn.cloud.tesla.com" },
      })) as unknown as typeof fetch
    const base = await discoverRegionBaseUrl({ accessToken: "tok", fetchImpl })
    expect(base).toBe("https://fleet-api.prd.eu.vn.cloud.tesla.com")
  })

  it("retombe honnêtement sur la base indiquée en cas d'erreur", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch
    const hint = "https://fleet-api.prd.eu.vn.cloud.tesla.com"
    const base = await discoverRegionBaseUrl({ accessToken: "tok", baseUrlHint: hint, fetchImpl })
    expect(base).toBe(hint)
  })
})
