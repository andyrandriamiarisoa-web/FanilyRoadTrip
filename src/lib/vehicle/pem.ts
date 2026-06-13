/**
 * Normalisation d'une clé publique PEM (Tesla `/.well-known`).
 *
 * Les variables d'environnement Vercel collées depuis un mobile perdent souvent
 * les retours à la ligne du PEM, le rendant illisible (« Invalid EC public key »
 * côté Tesla). Ce module reconstruit un PEM **canonique** à partir de quasiment
 * n'importe quelle entrée : sauts de ligne perdus, `\n` littéraux, espaces.
 *
 * Serveur uniquement (utilise `node:crypto`).
 */

import { createPublicKey } from "node:crypto"

/**
 * Renvoie un PEM de clé publique canonique (terminé par un saut de ligne), ou
 * `null` si l'entrée ne contient aucun corps base64 exploitable.
 */
export function normalizePublicKeyPem(raw: string | undefined | null): string | null {
  if (!raw) return null

  // 1) Restaure d'éventuels échappements littéraux (`\n`, `\r`) et nettoie.
  const unescaped = raw.replace(/\\r/g, "").replace(/\\n/g, "\n").trim()

  // 2) Si c'est déjà parseable tel quel, on renvoie la forme canonique.
  const direct = tryCanonical(unescaped)
  if (direct) return direct

  // 3) Sinon on isole le corps base64 (sans en-têtes ni espaces) et on le
  //    re-emballe en lignes de 64 caractères.
  const body = unescaped
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "")
  if (!body) return null

  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body
  const rebuilt = `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`

  // 4) Canonicalise si possible ; sinon renvoie le PEM reformé (meilleur effort
  //    — au moins les sauts de ligne sont corrects).
  return tryCanonical(rebuilt) ?? rebuilt
}

function tryCanonical(pem: string): string | null {
  try {
    const exported = createPublicKey(pem).export({ type: "spki", format: "pem" })
    return exported.toString()
  } catch {
    return null
  }
}
