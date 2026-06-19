# Mode d'emploi de configuration — Odyssée

> **Principe directeur : mock-first.** L'application fonctionne **intégralement
> sans aucune clé** (mode `mock`, déterministe, hors-ligne). Tout fournisseur
> externe est **optionnel** : il *enrichit* l'app avec des données réelles, il
> ne la *débloque* pas. Vous pouvez donc installer, déployer, démontrer — puis
> ajouter les clés une à une selon vos besoins.

Ce document est le guide d'installation **complet** :

1. [Prérequis & installation locale](#1-prérequis--installation-locale)
2. [Mode applicatif (`mock` vs `live`)](#2-mode-applicatif-mock-vs-live)
3. [Variables d'environnement — référence complète](#3-variables-denvironnement--référence-complète)
4. [Comptes à créer chez les fournisseurs externes](#4-comptes-à-créer-chez-les-fournisseurs-externes)
5. [Recettes de configuration](#5-recettes-de-configuration)
6. [Déploiement](#6-déploiement)
7. [Vérification post-déploiement](#7-vérification-post-déploiement)
8. [Dépannage](#8-dépannage)

---

## 1. Prérequis & installation locale

### Prérequis

| Outil | Version minimale | Vérification |
|-------|-----------------:|--------------|
| **Node.js** | 20 LTS | `node -v` |
| **npm** | 10+ | `npm -v` |
| **Git** | 2.30+ | `git --version` |

Optionnel : un compte **Vercel** (déploiement), **GitHub** (CI/CD), et les comptes
fournisseurs détaillés en [§4](#4-comptes-à-créer-chez-les-fournisseurs-externes).

### Installation locale (3 commandes)

```bash
git clone https://github.com/andyrandriamiarisoa-web/FanilyRoadTrip.git
cd FanilyRoadTrip
npm install
```

### Premier démarrage (mode démo, sans clé)

```bash
npm run dev                  # → http://localhost:3000
```

C'est tout. Le mode `mock` (par défaut) sert :

- un véhicule Tesla de démonstration ;
- une recherche d'hébergement déterministe ;
- un brouillon IA d'itinéraire et un récit gabarit gratuit ;
- des bornes de recharge et des POI pré-embarqués ;
- la météo, la disponibilité hôtels, OpenAgenda… tout en *seed*.

### Activer le mode live localement

Copier le fichier modèle et renseigner ce dont vous avez besoin :

```bash
cp .env.example .env.local
# éditez .env.local — voir §3 et §4
npm run dev
```

Le fichier `.env.local` est **ignoré par git** : aucune clé n'est jamais
commitée.

### Pipeline qualité

```bash
npm run typecheck   # TypeScript strict (zéro erreur attendue)
npm run lint        # ESLint + règles a11y
npm run test        # Vitest unit tests
npm run verify      # typecheck + lint + test + contraste + build
npm run e2e         # Playwright (smoke + axe-core)
```

---

## 2. Mode applicatif (`mock` vs `live`)

C'est le commutateur **maître**. Un seul interrupteur, deux comportements :

| `NEXT_PUBLIC_APP_MODE` | Effet |
|---|---|
| `mock` *(défaut)* | Tout en simulation déterministe, hors-ligne. Idéal démo / dev / tests. |
| `live` | Active les fournisseurs réels **pour lesquels une clé est posée**. Sans clé, chaque module retombe proprement sur le mock. |

> En `live`, un fournisseur sans clé = **repli mock silencieux et honnête**.
> Le champ `sourceStatus` affiché dans l'UI précise toujours d'où vient la
> donnée : `seed` (pré-embarqué), `estimated` (calculé), `verified` (récupéré
> en direct).

Vous pouvez donc passer en `live` même en n'ayant configuré qu'**un seul**
fournisseur.

---

## 3. Variables d'environnement — référence complète

Toutes les variables sont **optionnelles** et **serveur uniquement** (sauf
`NEXT_PUBLIC_APP_MODE`, qui n'est pas un secret).

### 3.1 Cœur applicatif

| Variable | Rôle | Défaut |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | Commutateur maître `mock` / `live` | `mock` |
| `ANTHROPIC_API_KEY` | Génération IA d'itinéraire, extraction de réservations, récit de synthèse (S6) | Mock déterministe |

### 3.2 Données géographiques & événements (palier gratuit)

| Variable | Rôle | Défaut |
|---|---|---|
| `OPENCHARGEMAP_API_KEY` | Bornes de recharge en direct | Seed embarqué |
| `OPENAGENDA_PUBLIC_KEY` | Événements datés le long du corridor (synthèse S3) | Mock |

> **Sans clé** : Open-Meteo (météo / vigilance chaleur) est appelé sans
> authentification en `live` ; les POI Overture/Foursquare sont
> **pré-embarqués** dans `src/data/poi.json` et rafraîchis hors-ligne via
> `scripts/ingest-poi.md`.

### 3.3 Disponibilité des hébergements (temps réel, R5)

| Variable | Rôle | Défaut |
|---|---|---|
| `AMADEUS_CLIENT_ID` | Fournisseur **primaire** — Amadeus Self-Service (Hotel Search) | Mock |
| `AMADEUS_CLIENT_SECRET` | Secret OAuth2 Amadeus | — |
| `LITEAPI_KEY` | Fournisseur **alternatif** — utilisé uniquement si Amadeus absent | — |
| `LODGING_AVAILABILITY_TTL_SECONDS` | TTL du cache de disponibilité (préserve le quota gratuit) | `600` (10 min) |

> **Ordre de priorité** : Amadeus → LiteAPI → mock. Lecture seule stricte :
> aucune réservation, aucun paiement. **Airbnb est hors périmètre** (aucune
> API libre).

### 3.4 Synthèse de voyage (S1–S7)

| Variable | Rôle | Défaut |
|---|---|---|
| `SYNTHESIS_SOLVER` | `ilp` → backend GLPK (glpk.js, WASM, serveur). Sinon sac à dos DP exact. | DP exact |

> Le DP est déjà **optimal** sur le modèle actuel : l'ILP est une option de
> démonstration / extension, pas un prérequis.

### 3.5 Tesla Fleet API (intégration véhicule réelle)

> Détail pas-à-pas dans **[`docs/TESLA.md`](TESLA.md)**.
> **Serveur uniquement** ; jamais exposées au navigateur.

| Variable | Requis en LIVE Tesla | Rôle |
|---|---|---|
| `TESLA_CLIENT_ID` | ✅ | OAuth Fleet API (flux `authorization_code`) |
| `TESLA_CLIENT_SECRET` | ✅ | Secret OAuth |
| `TESLA_REDIRECT_URI` | ✅ | Doit pointer **exactement** vers `https://VOTRE-DOMAINE/api/tesla/callback` |
| `TESLA_TOKEN_SECRET` | ✅ | Clé 32+ caractères chiffrant les jetons en cookie. Générer : `openssl rand -base64 32` |
| `TESLA_PUBLIC_KEY_PEM` | ✅ | Clé publique de domaine (PEM), servie sous `/.well-known/appspecific/com.tesla.3p.public-key.pem` |
| `TESLA_FLEET_API_BASE` | Optionnel | Base régionale (sinon découverte auto via `/api/1/users/region`) |
| `TESLA_STATE_CACHE_TTL_SECONDS` | Optionnel | TTL cache d'état véhicule (plafonne le coût Fleet API) | `300` (5 min) |
| ~~`TESLA_ACCESS_TOKEN`~~ | ❌ **Dev uniquement** | Jeton statique override (~8 h, sans refresh). **Ne pas poser en production.** |

**Bases régionales possibles** :

| Région | URL |
|---|---|
| Europe | `https://fleet-api.prd.eu.vn.cloud.tesla.com` |
| Amérique du Nord | `https://fleet-api.prd.na.vn.cloud.tesla.com` |

---

## 4. Comptes à créer chez les fournisseurs externes

Chaque section est **indépendante**. Faites-les dans l'ordre qui vous arrange,
ou skippez-les si le mock vous suffit.

### 4.1 Anthropic (Claude) — IA & récit

**À quoi ça sert** : génération d'itinéraire par description en texte libre,
extraction de réservations à partir d'un e-mail collé, récit de synthèse en
voix de barde. Modèle utilisé : `claude-sonnet-4-6`.

| Étape | Action |
|---|---|
| 1 | Créer un compte sur **<https://console.anthropic.com>**. |
| 2 | *Settings → API Keys* → **Create Key**. Nom suggéré : `odyssee-prod`. |
| 3 | Copier la clé (commence par `sk-ant-…`) — elle ne sera affichée qu'**une seule fois**. |
| 4 | Poser `ANTHROPIC_API_KEY=sk-ant-…` dans `.env.local` (dev) ou Vercel (prod). |
| 5 | *(Recommandé)* dans *Plans & Billing*, fixer un **budget mensuel** et activer les **alertes**. |

> Coût : facturation à l'usage. Les appels sont rares (génération à la
> demande) et brefs (forced tool use → JSON court). En cas d'erreur, l'app
> retombe automatiquement sur le mock — aucune panne visible.

### 4.2 Amadeus Self-Service — disponibilité hôtels (primaire)

**À quoi ça sert** : recherche temps réel d'hôtels (Hotel Search) le long de
l'itinéraire, classés sans exclusion. Lecture seule.

| Étape | Action |
|---|---|
| 1 | Créer un compte sur **<https://developers.amadeus.com>**. |
| 2 | *My Self-Service Workspace* → **Create New App**. Nom : `Odyssee`. |
| 3 | Récupérer **API Key** et **API Secret**. |
| 4 | Poser `AMADEUS_CLIENT_ID` et `AMADEUS_CLIENT_SECRET`. |
| 5 | Palier **gratuit** : ~2 000 appels/mois en environnement *Test*. Au-delà → repli mock automatique. |
| 6 | Pour la production, basculer dans l'environnement *Production* (changement de base URL côté Amadeus, géré par l'app). |

### 4.3 LiteAPI — disponibilité hôtels (alternative)

**À quoi ça sert** : remplaçant d'Amadeus si vous ne voulez pas créer de
compte Amadeus, ou si vous préférez son catalogue de tarifs temps réel.
Utilisé **uniquement si Amadeus n'est pas configuré**.

| Étape | Action |
|---|---|
| 1 | Créer un compte sur **<https://www.liteapi.travel>** (Developer Dashboard). |
| 2 | Créer une application → récupérer la **clé API**. |
| 3 | Poser `LITEAPI_KEY=…`. |

> Si vous configurez Amadeus **et** LiteAPI, Amadeus a la priorité.

### 4.4 OpenAgenda — événements datés (synthèse S3)

**À quoi ça sert** : événements culturels/locaux datés le long du corridor du
voyage (festivals, marchés, expositions), enrichissant la synthèse S3.

| Étape | Action |
|---|---|
| 1 | Créer un compte sur **<https://openagenda.com>**. |
| 2 | Aller sur **<https://developers.openagenda.com>** → demander une **clé publique** (lecture). |
| 3 | Poser `OPENAGENDA_PUBLIC_KEY=…`. |

> Gratuit, pas de quota strict pour un usage raisonnable.

### 4.5 Open Charge Map — bornes de recharge

**À quoi ça sert** : enrichir la base de chargeurs (au-delà du seed embarqué).
Les **Superchargeurs Tesla** importants pour le routage M4 sont déjà dans le
seed ; cette clé est surtout utile pour afficher des bornes tierces.

| Étape | Action |
|---|---|
| 1 | Créer un compte sur **<https://openchargemap.org>**. |
| 2 | *My Profile → My Apps* → **Register API Application**. |
| 3 | Récupérer la clé. |
| 4 | Poser `OPENCHARGEMAP_API_KEY=…`. |

> Gratuit. Sans clé, on tape l'API en mode non authentifié (quota plus
> serré) ou on retombe sur le seed embarqué.

### 4.6 Tesla Developer — Fleet API

**À quoi ça sert** : lire en direct l'état de charge (SoC) et l'autonomie de
votre Model S Raven, alimenter le `RoutePlanner` (M4) avec la vraie batterie.

> **Configuration la plus exigeante** des six fournisseurs. Détails complets
> et dépannage régional dans **[`docs/TESLA.md`](TESLA.md)**.

| Étape | Action |
|---|---|
| 1 | S'inscrire sur **<https://developer.tesla.com>** et créer une application. |
| 2 | **Type d'autorisation OAuth** : `authorization-code` + `client-credentials`. |
| 3 | **Origine autorisée** : `https://votre-domaine.example`. |
| 4 | **URI de redirection** : `https://votre-domaine.example/api/tesla/callback` (chemin exact). |
| 5 | **Scopes** : `vehicle_device_data` (lecture). Optionnel : `vehicle_cmds` + `vehicle_charging_cmds` (commandes legacy). |
| 6 | Récupérer **Client ID** et **Client Secret**. |
| 7 | Générer une paire de clés EC `prime256v1`. Mettre la **clé publique PEM** dans `TESLA_PUBLIC_KEY_PEM`. |
| 8 | Générer un secret de chiffrement : `openssl rand -base64 32` → `TESLA_TOKEN_SECRET`. |
| 9 | Poser `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI`. |
| 10 | **Enregistrer le domaine dans la région** (étape unique, après déploiement) : `curl -X POST https://votre-domaine.example/api/tesla/partner/register` |
| 11 | Dans l'app : *Paramètres → Connexion Tesla → « Connecter mon compte Tesla »*. |

> **Cause n°1 du 403** : compte européen sans enregistrement de domaine dans
> la région EU. L'app découvre automatiquement la bonne base régionale via
> `/api/1/users/region` — laissez `TESLA_FLEET_API_BASE` vide en cas de doute.

> **Commandes** : les véhicules **post-2021** exigent des commandes signées
> (Vehicle Command Protocol, incompatible serverless). L'app envoie des
> commandes **legacy** (compatible Raven et autres pré-2021). Si le véhicule
> exige des commandes signées, l'app l'**affiche honnêtement** plutôt que de
> simuler.

### 4.7 Open-Meteo, Overture, Foursquare — **aucun compte requis**

- **Open-Meteo** (météo / vigilance chaleur) : appelé sans authentification.
- **Overture Maps** + **Foursquare OS Places** (POI) : déjà ingérés et
  pré-embarqués dans `src/data/poi.json`. Pour rafraîchir : suivre
  `scripts/ingest-poi.md` (DuckDB + GeoParquet).

---

## 5. Recettes de configuration

### Recette A — Démo / vitrine (zéro configuration)

Aucune clé. Laisser `NEXT_PUBLIC_APP_MODE=mock`. Tout fonctionne, hors-ligne,
de manière déterministe. Idéal pour démos, présentations, et tests.

```bash
# .env.local
NEXT_PUBLIC_APP_MODE=mock
```

### Recette B — Live « essentiel » (IA + hôtels)

Activer Claude pour la génération d'itinéraires et un fournisseur de
disponibilité hôtels. Couvre 80 % de la valeur perçue.

```bash
NEXT_PUBLIC_APP_MODE=live
ANTHROPIC_API_KEY=sk-ant-…
AMADEUS_CLIENT_ID=…
AMADEUS_CLIENT_SECRET=…
# OU (alternative)
# LITEAPI_KEY=…
```

### Recette C — Live « voyage réel » (avec véhicule Tesla)

B + Tesla Fleet API pour lire le vrai SoC du véhicule au moment du départ.

```bash
NEXT_PUBLIC_APP_MODE=live
ANTHROPIC_API_KEY=sk-ant-…
AMADEUS_CLIENT_ID=…
AMADEUS_CLIENT_SECRET=…
TESLA_CLIENT_ID=…
TESLA_CLIENT_SECRET=…
TESLA_REDIRECT_URI=https://votre-domaine.example/api/tesla/callback
TESLA_TOKEN_SECRET=…   # openssl rand -base64 32
TESLA_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"
```

### Recette D — Live complet

C + événements + bornes tierces + (option) solveur ILP.

```bash
# Recette C +
OPENAGENDA_PUBLIC_KEY=…
OPENCHARGEMAP_API_KEY=…
SYNTHESIS_SOLVER=ilp                   # optionnel — DP est déjà optimal
LODGING_AVAILABILITY_TTL_SECONDS=600   # défaut
TESLA_STATE_CACHE_TTL_SECONDS=300      # défaut
```

---

## 6. Déploiement

### 6.1 Vercel (recommandé)

**Réglages GitHub** (`Settings → General → Pull Requests`) :

- [ ] **Allow auto-merge** (fusion auto sur CI verte).
- [ ] **Automatically delete head branches** (nettoyage).

**Brancher Vercel** (`Vercel → Project → Settings → Git`) :

- [ ] Dépôt `andyrandriamiarisoa-web/FanilyRoadTrip`, branche prod `main`.
- [ ] Build : `npm run build`, Node 20+.

**Variables d'environnement** (`Vercel → Project → Settings → Environment Variables`) :

- Cocher **Production** + **Preview** selon le besoin.
- Renseigner les variables de la recette choisie ([§5](#5-recettes-de-configuration)).
- **Supprimer `TESLA_ACCESS_TOKEN`** s'il est posé (redondant avec l'OAuth complet).

**Déploiement** :

```bash
npm i -g vercel && vercel login
vercel deploy --prod
```

### 6.2 Cloudflare Pages + Workers

```bash
npm i -D @opennextjs/cloudflare wrangler
# configurer wrangler.toml
npx wrangler pages deploy .next
```

### 6.3 Netlify

- Build command : `npm run build`
- Publish directory : `.next`
- Variables d'env via UI ou : `netlify deploy --prod --dir=.next`

---

## 7. Vérification post-déploiement

- [ ] L'app charge ; le bandeau de mode affiche `mock` ou `live`.
- [ ] `/parametres` → édition du Profil Foyer → la version (`v2`, `v3`…)
      s'incrémente à chaque enregistrement.
- [ ] `/plan` → *Générer le voyage de référence* produit un carnet complet.
- [ ] `/plan` → *Générer par IA* répond (brouillon mock sans clé, Claude
      sinon — la source est affichée).
- [ ] `/composer` compose des voyages ; « Enrichir le récit (IA) » répond
      (gabarit gratuit si pas de clé, Claude sinon).
- [ ] `/hebergements` renvoie des offres ; la **source** affichée est `mock`
      ou `Amadeus` / `LiteAPI`.
- [ ] `/lieux` liste des POI avec horaires et source.
- [ ] *(Si Tesla configuré)* `/parametres` → *Connecter mon compte Tesla* →
      consentement Tesla → retour à `/parametres` → SoC affiché.
- [ ] `/offline` liste honnêtement ce qui reste consultable hors réseau
      (carnet, budget, bagages, réservations, vote, cartes SVG).
- [ ] `TESLA_ACCESS_TOKEN` **absent** des variables de production.
- [ ] Les en-têtes de sécurité (CSP / HSTS / Permissions-Policy / …) sont
      présents (déjà gérés par `next.config.ts`).

---

## 8. Dépannage

### IA : « j'obtiens toujours le brouillon mock »

- Vérifier `NEXT_PUBLIC_APP_MODE=live` (et pas seulement `ANTHROPIC_API_KEY`).
- Vérifier le quota Anthropic dans la console (alertes / facturation).
- Les erreurs API entraînent un repli silencieux sur le mock — consulter les
  logs serveur (`vercel logs` ou équivalent) pour le motif.

### Hôtels : « toujours en source `mock` »

- Vérifier `NEXT_PUBLIC_APP_MODE=live`.
- Côté Amadeus : vérifier que vous êtes en environnement *Production* (pas
  *Test*) si vous déployez en prod, et que le quota mensuel n'est pas dépassé.
- En cas de quota dépassé : repli mock automatique et honnête (la fraîcheur
  `readAt` est conservée).
- Cache : `LODGING_AVAILABILITY_TTL_SECONDS` (défaut 10 min) — pour forcer un
  rafraîchissement, baisser temporairement à `0`.

### Tesla : `403 — Account must be registered in the current region`

- Cause n°1. Vérifier que l'enregistrement régional a été fait (étape 10) :
  ```bash
  curl -X POST https://votre-domaine.example/api/tesla/partner/register
  ```
- Vérifier la base régionale réelle :
  ```bash
  curl https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/users/region \
    -H "Authorization: Bearer $ACCESS_TOKEN"
  ```
- Laisser `TESLA_FLEET_API_BASE` vide pour que l'app la découvre.

### Tesla : « Commande refusée »

- Véhicule post-2021 (Model 3, Y, ou S/X récent) → exige des commandes
  signées (Vehicle Command Protocol) incompatibles avec un déploiement
  serverless. L'app le signale honnêtement.
- Véhicule Raven / pré-2021 → vérifier que les scopes `vehicle_cmds` +
  `vehicle_charging_cmds` ont bien été demandés au consentement.

### CSP : « ressource bloquée »

- L'en-tête CSP est servi par `next.config.ts`. Si un domaine externe est
  bloqué (tuile carte, asset…), il faut l'ajouter explicitement dans la
  policy. Voir `SECURITY.md`.

### Variables d'environnement : « la clé n'est pas lue »

- Sur Vercel, redéployer après ajout/modification d'une variable.
- En local, redémarrer `npm run dev` après modification de `.env.local`.
- Vérifier que `.env.local` est à la **racine** du projet (et pas dans
  `src/`).
- Les variables `NEXT_PUBLIC_*` sont injectées au **build** ; un changement
  nécessite un rebuild.

---

## Annexes

- **[`docs/GUIDE.md`](GUIDE.md)** — utilisation pas-à-pas pour l'utilisateur
  final (Profil Foyer, planification, carnet, budget, bagages, hors-ligne).
- **[`docs/TESLA.md`](TESLA.md)** — guide détaillé Tesla Fleet API (OAuth,
  enregistrement régional, clé publique de domaine, commandes legacy).
- **[`docs/SETUP-VERCEL.md`](SETUP-VERCEL.md)** — focus déploiement Vercel.
- **[`SECURITY.md`](../SECURITY.md)** — posture sécurité, gestion des
  secrets, en-têtes HTTP, confidentialité.
- **[`CLAUDE.md`](../CLAUDE.md)** — état d'avancement, décisions
  d'architecture, anti-patterns interdits.
- **[`.env.example`](../.env.example)** — fichier modèle à copier en
  `.env.local`.
