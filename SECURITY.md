# Sécurité — Odyssée

Application **privée**, mobile-first, **sans serveur de données** : tout vit dans
le navigateur (IndexedDB via Dexie). Cette page décrit la posture de sécurité et
le traitement des secrets.

## Secrets & tokens

| Secret | Stockage | Exposition client |
|--------|----------|-------------------|
| `ANTHROPIC_API_KEY` | Variable d'environnement serveur (Vercel / GitHub Secrets) | **Jamais** — utilisé uniquement dans les routes `/api/agents/*` |
| `TESLA_CLIENT_ID` / `TESLA_CLIENT_SECRET` | Variable d'environnement serveur | **Jamais** — flux OAuth dans `/api/tesla/*` |
| `TESLA_TOKEN_SECRET` | Variable d'environnement serveur | **Jamais** — clé de chiffrement AES-256-GCM des jetons en cookie |
| Jetons utilisateur Tesla (`access`/`refresh`) | **Cookie `httpOnly` chiffré** (AES-256-GCM) | **Jamais** en clair — déchiffrés côté serveur uniquement |
| `TESLA_ACCESS_TOKEN` (override dev) | Variable d'environnement serveur | **Jamais** — utilisé uniquement dans les routes `/api/vehicle/*` |
| `TESLA_PUBLIC_KEY_PEM` | Variable d'environnement serveur | Servie publiquement à dessein sous `/.well-known/...` (clé **publique**) |
| `OPENCHARGEMAP_API_KEY` | Variable d'environnement serveur | **Jamais** |

- La fabrique `getVehicleProvider*()` / les orchestrateurs IA ne sont appelés que
  dans des **route handlers serverless** : les clés ne transitent jamais par le
  bundle client.
- **Lecture Fleet API mise en cache (TTL)** pour limiter le coût et la surface
  d'appel ; aucun réveil de véhicule, aucune relance sur erreur facturable.

### Flux OAuth Tesla (mode LIVE réel) — implémenté

Le flux `authorization_code` complet est en place (`src/lib/vehicle/tesla-oauth.ts`,
`tesla-session.ts`, routes `/api/tesla/*`). Posture :

1. **Jetons chiffrés au repos** : `access_token` + `refresh_token` + base
   régionale sont sérialisés puis chiffrés en **AES-256-GCM** (clé dérivée de
   `TESLA_TOKEN_SECRET`) dans un cookie `httpOnly` + `Secure` + `SameSite=Lax`.
   Un cookie volé sans le secret serveur est inexploitable.
2. **Rotation du refresh token** : à chaque rafraîchissement, le nouveau
   `refresh_token` renvoyé par Tesla remplace l'ancien dans le cookie réécrit.
3. **`state` anti-CSRF** sur le flux d'autorisation (cookie httpOnly court,
   comparé au retour).
4. Les jetons ne sont **jamais journalisés** ; seules les erreurs (statut,
   message) le sont.

> Le mode `mock` (défaut) reste sans aucun secret ni token. Voir `docs/TESLA.md`
> pour la mise en service LIVE.

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
