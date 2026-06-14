# Odyssée — Mise en service (Vercel & fournisseurs externes)

> **Principe : mock-first.** L'application fonctionne **entièrement sans aucune
> clé** (mode `mock`, déterministe, hors-ligne). Chaque fournisseur externe est
> **optionnel** : il *enrichit* l'app avec des données réelles, il ne la
> *débloque* pas. Vous pouvez donc déployer d'abord, puis ajouter les clés une à
> une. Toutes les clés sont **lues côté serveur uniquement** — jamais exposées au
> navigateur (sauf `NEXT_PUBLIC_APP_MODE`, qui n'est pas un secret).

---

## 0. Le commutateur maître

| Variable | Valeur | Effet |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | `mock` *(défaut)* | Tout en simulation déterministe, hors-ligne. |
| `NEXT_PUBLIC_APP_MODE` | `live` | Active les fournisseurs réels **pour lesquels une clé est posée**. Sans clé, chaque module retombe proprement sur le mock. |

> En `live`, un fournisseur sans clé = repli mock silencieux et honnête (la source
> affichée le précise). Vous pouvez donc passer en `live` même en n'ayant
> configuré qu'un seul fournisseur.

---

## 1. Réglages du dépôt GitHub (hors code — à cocher une fois)

Dans **GitHub → Settings → General → Pull Requests** :

- [ ] **Allow auto-merge** (permet la fusion automatique sur CI verte).
- [ ] **Automatically delete head branches** (nettoie les branches fusionnées).

Dans **Vercel → Project → Settings → Git** :

- [ ] Brancher le dépôt `andyrandriamiarisoa-web/FanilyRoadTrip`, branche de prod `main`.
- [ ] Vérifier la commande de build par défaut (`npm run build`) et Node 20+.

---

## 2. Variables d'environnement Vercel

À renseigner dans **Vercel → Project → Settings → Environment Variables**
(cocher *Production* + *Preview* selon le besoin). **Aucune n'est obligatoire.**

### 2.1 Cœur

| Variable | Requis | Rôle | Défaut si absente |
|---|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | Recommandé | `mock` ou `live` (commutateur maître) | `mock` |
| `ANTHROPIC_API_KEY` | Optionnel | Génération IA d'itinéraire, extraction de réservations, **récit de synthèse (S6)** | Mock déterministe |

### 2.2 Lieux, événements, chargeurs (données quasi-statiques / gratuites)

| Variable | Requis | Rôle | Défaut |
|---|---|---|---|
| `OPENCHARGEMAP_API_KEY` | Optionnel | Bornes de recharge en direct | Seed embarqué |
| `OPENAGENDA_PUBLIC_KEY` | Optionnel | Événements datés le long du corridor (synthèse S3) | Mock |

### 2.3 Disponibilité des hébergements (temps réel, R5)

| Variable | Requis | Rôle | Défaut |
|---|---|---|---|
| `AMADEUS_CLIENT_ID` | Optionnel | Fournisseur **primaire** (Amadeus Self-Service, Hotel Search) | Mock |
| `AMADEUS_CLIENT_SECRET` | Optionnel | Secret OAuth2 Amadeus | — |
| `LITEAPI_KEY` | Optionnel | Fournisseur **alternatif** (utilisé si Amadeus absent) | — |
| `LODGING_AVAILABILITY_TTL_SECONDS` | Optionnel | TTL du cache de dispo (préserve le quota gratuit) | `600` |

> Priorité : **Amadeus** si ses identifiants sont posés, sinon **LiteAPI** si sa
> clé l'est, sinon **mock**. Lecture seule stricte : aucune réservation/paiement.

### 2.4 Synthèse de voyage

| Variable | Requis | Rôle | Défaut |
|---|---|---|---|
| `SYNTHESIS_SOLVER` | Optionnel | `ilp` → backend GLPK (glpk.js, WASM, serveur) ; sinon sac à dos DP exact | DP exact |

> Le DP est déjà **optimal** sur le modèle actuel : l'ILP est une option de
> démonstration/extension, pas un prérequis.

### 2.5 Tesla Fleet API (intégration véhicule réelle)

> Le détail pas-à-pas est dans **`docs/TESLA.md`**. Toutes serveur uniquement.

| Variable | Requis (mode Tesla réel) | Rôle |
|---|---|---|
| `TESLA_CLIENT_ID` | Oui | OAuth Fleet API (flux `authorization_code`) |
| `TESLA_CLIENT_SECRET` | Oui | Secret OAuth |
| `TESLA_REDIRECT_URI` | Oui | Doit pointer **exactement** vers `https://VOTRE-DOMAINE/api/tesla/callback` |
| `TESLA_TOKEN_SECRET` | Oui | Clé 32+ caractères chiffrant les jetons en cookie (`openssl rand -base64 32`) |
| `TESLA_PUBLIC_KEY_PEM` | Oui | Clé publique de domaine, servie sous `/.well-known/...` |
| `TESLA_FLEET_API_BASE` | Optionnel | Base régionale (sinon découverte auto via `/users/region`) |
| `TESLA_STATE_CACHE_TTL_SECONDS` | Optionnel | TTL cache d'état véhicule (plafonne le coût Fleet API). Défaut `300` |
| ~~`TESLA_ACCESS_TOKEN`~~ | **À NE PAS poser en prod** | Override dev uniquement (jeton statique, ~8 h, sans refresh) |

- [ ] **Supprimer `TESLA_ACCESS_TOKEN`** des variables Vercel s'il y est encore
      (redondant avec l'OAuth complet).

---

## 3. Comptes & démarches chez les fournisseurs externes

### Anthropic (Claude) — IA & récit
1. Créer un compte sur **https://console.anthropic.com**.
2. Générer une **API key**.
3. Poser `ANTHROPIC_API_KEY` dans Vercel. Modèle utilisé : `claude-sonnet-4-6`.
4. *(Optionnel)* surveiller la consommation (facturation à l'usage).

### Amadeus Self-Service — disponibilité hôtels (primaire)
1. Créer un compte sur **https://developers.amadeus.com**.
2. Créer une application → récupérer **API Key** et **API Secret**.
3. Poser `AMADEUS_CLIENT_ID` et `AMADEUS_CLIENT_SECRET`.
4. Palier **gratuit** (quota mensuel) ; au-delà → repli mock automatique.
5. Lecture seule : on n'utilise que *Hotel Search* (recherche + tarifs).

### LiteAPI — disponibilité hôtels (alternative)
1. Créer un compte sur **https://www.liteapi.travel** (dashboard développeur).
2. Récupérer la clé API.
3. Poser `LITEAPI_KEY` (utilisée seulement si Amadeus n'est pas configuré).

### OpenAgenda — événements datés (synthèse)
1. Créer un compte sur **https://openagenda.com** puis **https://developers.openagenda.com**.
2. Récupérer une **clé publique** (lecture).
3. Poser `OPENAGENDA_PUBLIC_KEY`.

### Open Charge Map — bornes de recharge
1. Créer un compte sur **https://openchargemap.org** → *My Apps* → clé API.
2. Poser `OPENCHARGEMAP_API_KEY`.

### Tesla Developer — Fleet API
1. S'inscrire sur **https://developer.tesla.com** et créer une application.
2. Déclarer l'**URI de redirection** = `https://VOTRE-DOMAINE/api/tesla/callback`.
3. Générer une paire de clés ; mettre la **clé publique** dans `TESLA_PUBLIC_KEY_PEM`.
4. Après déploiement, enregistrer le domaine via la route `/api/tesla/partner/register`.
5. Renseigner `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI`, `TESLA_TOKEN_SECRET`.
6. **Détails complets et dépannage régional : `docs/TESLA.md`.**

> Open-Meteo (météo / vigilance chaleur) et les jeux de POI ouverts
> (Overture/Foursquare) **ne nécessitent aucune clé** : Open-Meteo est appelé
> sans authentification en `live`, et les POI sont pré-embarqués (rafraîchis via
> `scripts/ingest-poi.md`). Airbnb est **hors périmètre** (aucune API libre).

---

## 4. Recettes rapides

**A. Démo / vitrine (zéro configuration)**
- Ne rien poser. Laisser `NEXT_PUBLIC_APP_MODE=mock`. Tout fonctionne, hors-ligne.

**B. Live « essentiel » (IA + hôtels)**
1. `NEXT_PUBLIC_APP_MODE=live`
2. `ANTHROPIC_API_KEY`
3. `AMADEUS_CLIENT_ID` + `AMADEUS_CLIENT_SECRET`
   *(ou `LITEAPI_KEY`)*

**C. Live complet**
- B + `OPENAGENDA_PUBLIC_KEY` + `OPENCHARGEMAP_API_KEY` + le bloc `TESLA_*`.
- *(Option)* `SYNTHESIS_SOLVER=ilp`.

---

## 5. Checklist de vérification après déploiement

- [ ] L'app charge ; le bandeau de mode affiche `mock` ou `live`.
- [ ] `/composer` compose des voyages ; « Enrichir le récit » répond (gabarit si pas de clé, IA sinon).
- [ ] `/hebergements` renvoie des offres ; la **source** affichée est `mock` ou `Amadeus`/`LiteAPI`.
- [ ] `/lieux` liste des POI avec horaires et source.
- [ ] *(Si Tesla configuré)* `/parametres` → connexion Tesla → lecture du SoC.
- [ ] `TESLA_ACCESS_TOKEN` **absent** des variables de production.
- [ ] Les en-têtes de sécurité (CSP/HSTS) sont présents (déjà gérés par le code).

---

*Toutes les variables et leur comportement par défaut sont également documentés
dans `.env.example` (à la racine) et `CLAUDE.md` (section « Variables
d'environnement »).*
