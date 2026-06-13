# Sécurité — Odyssée

Application **privée**, mobile-first, **sans serveur de données** : tout vit dans
le navigateur (IndexedDB via Dexie). Cette page décrit la posture de sécurité et
le traitement des secrets.

## Secrets & tokens

| Secret | Stockage | Exposition client |
|--------|----------|-------------------|
| `ANTHROPIC_API_KEY` | Variable d'environnement serveur (Vercel / GitHub Secrets) | **Jamais** — utilisé uniquement dans les routes `/api/agents/*` |
| `TESLA_ACCESS_TOKEN` | Variable d'environnement serveur | **Jamais** — utilisé uniquement dans les routes `/api/vehicle/*` |
| `TESLA_PUBLIC_KEY_PEM` | Variable d'environnement serveur | Servie publiquement à dessein sous `/.well-known/...` (clé **publique**) |
| `OPENCHARGEMAP_API_KEY` | Variable d'environnement serveur | **Jamais** |

- **Aucun token n'est stocké au repos par l'application.** Les jetons sont lus
  depuis l'environnement au moment de l'appel, côté serveur uniquement. Il n'y a
  donc pas de token-at-rest à chiffrer dans l'architecture actuelle.
- La fabrique `getVehicleProvider()` / les orchestrateurs IA ne sont appelés que
  dans des **route handlers serverless** : les clés ne transitent jamais par le
  bundle client.
- **Lecture Fleet API mise en cache (TTL)** pour limiter le coût et la surface
  d'appel ; aucun réveil de véhicule, aucune relance sur erreur facturable.

### Flux OAuth Tesla complet (mode LIVE réel)

L'implémentation actuelle lit un `TESLA_ACCESS_TOKEN` fourni par l'environnement
(approche mock-first). Pour un déploiement avec le **flux OAuth complet**
(`authorization_code` + `refresh_token` à usage unique, ~3 mois) :

1. Stocker `access_token` / `refresh_token` **chiffrés au repos** côté serveur
   (KMS / secret manager), jamais en clair.
2. Implémenter la **rotation** : à chaque rafraîchissement, le `refresh_token`
   précédent est invalidé — persister le nouveau de façon atomique.
3. Ne jamais logguer les jetons ; ne pas activer le debug verbeux des Actions
   sur des workflows ayant accès aux secrets.

Ces étapes sont documentées comme prérequis de déploiement ; elles n'ont pas
d'objet tant que l'app fonctionne en mode MOCK ou avec un token d'environnement.

## En-têtes HTTP (`next.config.ts`)

| En-tête | Valeur | But |
|---------|--------|-----|
| `Content-Security-Policy` | `default-src 'self'` + sources explicites | Limite les origines (scripts/styles/images/connexions) |
| `X-Content-Type-Options` | `nosniff` | Empêche le MIME-sniffing |
| `X-Frame-Options` | `DENY` | Anti-clickjacking (+ `frame-ancestors 'none'` en CSP) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limite la fuite de referrer |
| `Permissions-Policy` | caméra/micro/géoloc désactivés | Réduit la surface d'API navigateur |
| `Strict-Transport-Security` | `max-age=2 ans; includeSubDomains; preload` | Force HTTPS |

> La CSP autorise `'unsafe-inline'` pour `style`/`script` (attributs `style`
> inline + script de thème inline). Un durcissement par **nonce** est la
> prochaine étape possible si les scripts inline sont éliminés.

## Confidentialité

- Données du foyer et préférences : **locales** (IndexedDB), jamais envoyées à un
  tiers non nécessaire.
- Partage de voyage / vote : encodé dans l'URL (lz-string), **opt-in** par
  l'utilisateur ; aucun backend ne reçoit ces données.
- Aucune télémétrie tierce.

## Signalement

Application privée — signaler toute vulnérabilité directement au mainteneur.
