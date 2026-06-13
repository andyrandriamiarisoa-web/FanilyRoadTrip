import type { NextConfig } from "next";

/**
 * En-têtes de sécurité (M10).
 *
 * CSP volontairement compatible avec l'app : styles inline (attributs `style`
 * + Tailwind) et script de thème inline nécessitent `'unsafe-inline'` ; les
 * tuiles OSM sont autorisées en images. Tout le reste est verrouillé sur
 * `'self'`. Les appels externes (Tesla, Anthropic, Open-Meteo, OSRM) se font
 * **côté serveur** — pas besoin de les ouvrir dans `connect-src`.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Version déployée — exposée au client pour lever toute ambiguïté sur la build
// en cours (utile pour vérifier qu'un correctif est bien en ligne). Le SHA vient
// de Vercel ; l'horodatage est figé au moment du build.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
const BUILD_TIME = new Date().toISOString();

const baseConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: BUILD_SHA,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

const withSerwist = async (config: NextConfig): Promise<NextConfig> => {
  const { default: withSerwistInit } = await import("@serwist/next");
  return withSerwistInit({
    swSrc: "src/sw.ts",
    swDest: "public/sw.js",
    disable: process.env.NODE_ENV !== "production",
  })(config);
};

export default async () => withSerwist(baseConfig);
