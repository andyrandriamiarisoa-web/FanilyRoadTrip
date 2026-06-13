/**
 * Clé publique de domaine exigée par la Tesla Fleet API.
 *
 * Tesla impose d'héberger la clé publique de l'application à ce chemin exact
 * pour valider le domaine du tiers. La clé est fournie via la variable
 * d'environnement `TESLA_PUBLIC_KEY_PEM` (jamais commitée). Sans clé → 404,
 * ce qui est correct en mode MOCK (aucune intégration Tesla active).
 *
 * La valeur est **normalisée** avant d'être servie : une variable d'env collée
 * depuis un mobile perd souvent les retours à la ligne du PEM, ce qui faisait
 * échouer Tesla en « Invalid EC public key ». On reconstruit un PEM canonique.
 */
import { normalizePublicKeyPem } from "@/lib/vehicle/pem"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export function GET() {
  const pem = normalizePublicKeyPem(process.env.TESLA_PUBLIC_KEY_PEM)
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
