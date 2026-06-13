/**
 * Clé publique de domaine exigée par la Tesla Fleet API.
 *
 * Tesla impose d'héberger la clé publique de l'application à ce chemin exact
 * pour valider le domaine du tiers. La clé est fournie via la variable
 * d'environnement `TESLA_PUBLIC_KEY_PEM` (jamais commitée). Sans clé → 404,
 * ce qui est correct en mode MOCK (aucune intégration Tesla active).
 */
export const dynamic = "force-dynamic"

export function GET() {
  const pem = process.env.TESLA_PUBLIC_KEY_PEM
  if (!pem) {
    return new Response("Not found", { status: 404 })
  }
  return new Response(pem, {
    status: 200,
    headers: {
      "Content-Type": "application/x-pem-file",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
