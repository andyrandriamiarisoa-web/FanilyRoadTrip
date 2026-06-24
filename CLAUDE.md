# Odyssée — Carnet de route PWA

Application PWA mobile-first en français pour planifier un voyage en Tesla Model S Raven avec contraintes familiales et médicales.

## État d'avancement

| Lot | Sujet | Statut |
|-----|-------|--------|
| P0–P6 | Fondations, charge Tesla, providers, agents, carte, hébergements, PWA, CI/CD | ✅ mergé |
| M1 | **Profil Foyer éditable & versionné** (IndexedDB, consommé par le planificateur) | ✅ |
| M3 | **Connexion Tesla mock-first** (`VehicleProvider`, sélection véhicule, lecture SoC ponctuelle) | ✅ |
| M4 | **Routage charge-aware** (`RoutePlanner`, Superchargeurs only, SoC départ réel/cible → arrivée cible, préconditionnement) | ✅ |
| M5 | **Fusion des contraintes** (pauses bébé, blocage canicule 12h–16h, évitement télétravail, chronologie heure par heure) | ✅ |
| M6 | **Hébergements & workation** (conformité bureau/clim/5G/matelas, classement sans exclusion) | ✅ |
| M7 | **Génération IA** (API Anthropic `claude-sonnet-4-6`, forced tool use → JSON validé Zod, mock-first) | ✅ |
| M8a | **Budget & dépenses** (ventilation par poste, découpage entre voyageurs, règlements minimaux) | ✅ |
| M8b | **Listes de bagages** bébé-aware (durée/saison, quantités échelonnées, checklist persistante) | ✅ |
| M8c | **Import des réservations** (extraction mock-first/IA, agrégation dans l'itinéraire) | ✅ |
| M9a | **Export calendrier** (.ics RFC 5545 — événements fixes, nuitées, réservations) | ✅ |
| M9b | **Collaboration** (vote d'activités par approbation, sondage fusionnable & partageable par URL) | ✅ |
| M9c | **Robustesse hors-ligne** (indicateur de connexion live, fonctions disponibles offline) | ✅ |
| M10a | **Audit a11y automatisé** (axe-core sur toutes les pages clés, zéro violation critique) | ✅ |
| M10b | **Durcissement sécurité** (en-têtes HTTP CSP/HSTS/…, posture tokens documentée `SECURITY.md`) | ✅ |
| M10c | **Documentation utilisateur** (`docs/GUIDE.md`, README à jour) — roadmap M0–M10 complète | ✅ |
| R1 | **Corrections** : home sans itinéraire codé en dur · blocage 12h–16h conditionnel à une vigilance chaleur réelle | ✅ |
| R2 | **Ingestion POI ouverts** (Overture/Foursquare, seed normalisé Zod, requêtable hors-ligne, horaires partiels signalés) | ✅ |
| R3 | **Recherche lieux & horaires** (`/lieux`, classement par proximité sans exclusion, source affichée) | ✅ |
| R4 | **Orchestration jours de télétravail** (coworking prioritaire + plan visites famille bébé/canicule-aware) | ✅ |
| R5 | **Adaptateur disponibilité hôtels** (`LodgingAvailabilityProvider`, mock-first + LiteAPI/Hotelbeds sandbox live, read-only, cache, classement sans exclusion) | ✅ |
| R6 | **Ménage & doc** (env hôtels sandbox, `TESLA_ACCESS_TOKEN` dev-only, `CLAUDE.md`/`.env.example` à jour) | ✅ |
| S1 | **Modèle de synthèse + solveur heuristique** (« Ancre & Orbite » — dates calculées, adaptateurs injectés) | ✅ |
| S2 | **Multi-candidats & ambiances** (Reposant/Sociable/Découvreur/Thématique, regret exposé) | ✅ |
| S3 | **Cadran de dates + OpenAgenda** (flexibilité des dates première classe, événements datés mock/live) | ✅ |
| S4 | **Contraintes comme découverte** (`curateSlot` — pauses/charge/canicule/jour travaillé enrichis, sans exclure) | ✅ |
| S5 | **Graphe social géolocalisé** (personnes-ancres souples, IndexedDB local, ambiance Sociable) | ✅ |
| S6 | **Récit IA** (barde, pas inventeur — prompt + repli gabarit gratuit, aucun fait inventé) | ✅ |
| S7 | **Durcissement du solveur** (sac à dos 0/1 exact + layout aligné sur la date d'ancre — pur TS, déployable) | ✅ |
| U1 | **Refonte `/plan` mode production** (Mode A planifié / Mode B avec ancre, formulaires propres, voyage de référence hardcodé retiré) | ✅ |

**Refonte `/plan` (U1)** : suppression du « voyage de référence » Fresnes↔Marseille
codé en dur. La page `/plan` propose désormais **deux entrées** :

- **Mode A — Voyage planifié** (`PlannedTripForm`) : point de départ +
  destination + dates départ/retour + étapes à respecter (chacune avec
  durée et option « date fixée » ou « libre ») + envies libres. Appelle
  `/api/agents/itinerary` (Claude en LIVE, brouillon mock-first sinon).
- **Mode B — Voyage avec ancre** (`AnchoredTripForm`) : événement à date
  et lieu fixes + fenêtre de voyage (min/max nuits) + point de départ +
  étapes en chemin (mêmes options que mode A). Construit un
  `SynthesisRequest` complet (constraints dérivées du Profil Foyer) et
  appelle `/api/synthesis` (solveur déterministe S1–S7).

Composants : `src/components/plan/` (PlanWizard, ModeSelector,
PlannedTripForm, AnchoredTripForm, StopList, CityAutocomplete,
DraftPreview, CandidatesPreview). Saisie ville avec suggestions natives
`<datalist>` depuis `FRENCH_CITIES`. `/composer` redirige désormais vers
`/plan` (Mode B). Composants supprimés : `PlanGenerator`,
`AiItineraryGenerator`, `ChargePlanner`, `Composer`, `PeopleEditor` ;
données supprimées : `voyage-reference.ts`/`json`.

**Profil Foyer (M1)** : le profil de référence (`src/data/default-profile.ts`) est
copié dans IndexedDB au premier lancement, éditable depuis `/parametres`
(`ProfileSettings`), et **versionné** — chaque enregistrement incrémente `version`
et horodate `updatedAt`. La logique pure vit dans `src/lib/profile/profile.ts`
(testée), la persistance dans `src/lib/db.ts` (`loadActiveProfile`,
`saveProfilePatch`). Le `profileId` actif est transmis à `/api/agents/plan` et
estampillé sur le `TripPlan` généré. **Paramètres véhicule injectés (M4)** :
`vehicleParamsFromProfile` (`src/lib/routing/types.ts`) convertit le bloc
`vehicle` du profil (Wh/100 km, SoC en fractions) vers les `VehicleParams` du
planificateur (Wh/km, SoC en %) ; `ChargePlanner` les envoie à `/api/route/plan`
(schéma Zod élargi) → **modifier le profil change réellement le routage**
(consommation, charge, buffer). Valeurs **réelles** Model S Raven : ~18,5 kWh/100 km
mixte, ~24 kWh/100 km autoroute (130 km/h), ~26 en canicule. *Prochaine étape :
injecter aussi les pauses/horaires du profil dans la fusion M5.*

**Connexion Tesla (M3)** : couche `VehicleProvider` (`src/lib/vehicle/`) derrière
deux implémentations — `MockVehicleProvider` (défaut, déterministe, hors-ligne)
et `TeslaVehicleProvider` (Fleet API réelle, activée si `NEXT_PUBLIC_APP_MODE=live`
+ `TESLA_FLEET_API_BASE` + `TESLA_ACCESS_TOKEN`). La fabrique `getVehicleProvider()`
n'est appelée que côté serveur (`/api/vehicle/list`, `/api/vehicle/state`) → les
tokens ne touchent jamais le client. Lecture **ponctuelle** du SoC (vérification de
connectivité d'abord, aucun polling). UI `/parametres` : connexion → choix du
véhicule → jauge SoC + autonomie, source affichée (mock/réel), sélection persistée.
Clé publique de domaine servie via `/.well-known/.../com.tesla.3p.public-key.pem`
depuis `TESLA_PUBLIC_KEY_PEM` (404 si absente). *Prochaine étape : alimenter le
`RoutePlanner` (M4) avec le SoC réel/cible.*

**Routage charge-aware (M4)** : interface `RoutePlanner` (`src/lib/routing/`) +
`SeedRoutePlanner` déterministe (option B « moteur maison »). Glouton « plus loin
atteignable » : Superchargeurs filtrés par **détour réel** `d(O→C)+d(C→D)−d(O→D)`
(robuste aux coudes autoroutiers), insertion d'arrêts dès que le SoC frôlerait le
buffer de sécurité, charge plafonnée à 80 % (fenêtre batterie), respect du SoC
d'arrivée cible. Chaque arrêt porte un rappel de **préconditionnement**. Infaisabilité
signalée honnêtement (jamais masquée). Exposé via `/api/route/plan` ; UI `/plan`
(`ChargePlanner`) avec SoC de départ **réel** (lu du véhicule M3) ou **cible**.
Testé sur le trajet fixture Fresnes→Marseille (arrêts cohérents, arrivée respectée).
*Prochaine étape : fusionner ces arrêts avec les pauses bébé / canicule / télétravail (M5).*

**Fusion des contraintes (M5)** : moteur pur `fuseDayTimeline` (`src/lib/constraints/`)
qui simule une horloge le long de la conduite et insère, par priorité :
pauses **bébé** (≤ `maxLegMinutes`, réinitialisées par une recharge → alignement),
**blocages** canicule 12h–16h et heures de **télétravail** (conduite différée jusqu'à
la fin de la fenêtre), et **recharges**. Produit une **chronologie heure par heure**
et signale honnêtement les débordements (nuitée nécessaire). Branché dans
`ChargePlanner` (heure de départ + bascules canicule / jour travaillé) à partir du
Profil Foyer (M1). Testé : un trajet en canicule recale les pauses et bloque 12h–16h.
*Prochaine étape : hébergements conformes + mode workation (M6).*

**Hébergements & workation (M6)** : `src/lib/lodging/workation.ts` évalue chaque
hébergement contre les exigences télétravail (bureau ≥ N cm, fibre + secours 5G,
clim) et médicale (matelas ferme), en combinant équipements + couverture 5G SFR
de la commune (`5g-coverage.json`). Statut par critère : conforme / à confirmer /
non conforme. **Anti-pattern respecté** : `rankForWorkationNight` **classe sans
jamais exclure** ; `recommendForWorkationNight` recommande le meilleur conforme
s'il existe, sinon signale. Surface dans `LodgingPanel` (badges de conformité,
nouveau badge `badge-danger` WCAG AA). *Prochaine étape : génération IA (M7).*

**Bureau partagé à proximité (extension M6)** : le Profil Foyer peut autoriser un
**espace de coworking proche** du lieu de couchage (`allowSharedOffice`,
`maxOfficeMinutesSkateboard`, défaut 10 min). Seed `coworking.json` par commune
(`getCoworkingForCommune`). Quand un bureau partagé est assez proche, il **satisfait
le critère poste de travail** même si l'hébergement n'a pas de bureau conforme, et
**assouplit le late checkout** (`lateCheckoutSoftened`) — on n'a plus besoin de
travailler dans la chambre jusqu'au départ. Éditable dans `/parametres`, affiché
dans `LodgingPanel`.

**Génération IA (M7)** : `src/lib/agents/itinerary-ai.ts` propose un itinéraire
structuré à partir d'une description en texte libre + le Profil Foyer. **Mock-first**
(`itinerary-mock.ts`, déterministe) ; en mode LIVE, appel à l'API Anthropic
(`claude-sonnet-4-6`) en **forced tool use** (`tool_choice`) pour garantir une
sortie JSON, validée par `AiItineraryDraftSchema` (Zod) — repli propre sur le mock
en cas d'erreur. Clé API serveur uniquement (`/api/agents/itinerary`). UI `/plan`
(`AiItineraryGenerator`) : description → brouillon **éditable** (titres + activités
par jour), contraintes appliquées affichées, source (Claude/mock) indiquée.
*Prochaine étape : budget, bagages, réservations (M8).*

**Budget & dépenses (M8a)** : logique pure `src/lib/budget/budget.ts` (calculs en
centimes) — total, **ventilation par poste**, comparaison budget cible / dépensé,
et **découpage entre voyageurs** façon Lambus (`travelerBalances` + `settleBalances`
= virements minimaux, centime résiduel réparti déterministe). Persistance Dexie v3
(`expenses`, `budgetSettings`). UI `/budget` (`BudgetManager`) : ajout de dépense
(poste, payeur, partage), barres de ventilation, soldes par voyageur et règlements
suggérés. *Prochaine étape : listes de bagages bébé-aware, puis import des réservations.*

**Listes de bagages (M8b)** : générateur pur `src/lib/packing/packing.ts`
(déterministe) adapté à **la durée, la saison et le bébé** — quantités
échelonnées (couches = jours × 6, jeux de vêtements plafonnés à 7), sections
conditionnelles (bébé < 36 mois, été/hiver, workation, Tesla). Clés d'article
stables pour mémoriser le cochage. UI `/bagages` (`PackingList`) : config
durée/mois (saison dérivée), checklist groupée par catégorie avec progression,
état persisté en IndexedDB (Dexie v4). *Prochaine étape : import des réservations (M8c).*

**Import des réservations (M8c)** : extraction d'une confirmation collée vers
une réservation structurée. **Mock-first** : parseur heuristique déterministe
(`reservation-parse.ts` — type, dates FR/ISO, n° de confirmation, prestataire,
lieu) ; en mode LIVE, Claude (`claude-sonnet-4-6`) en forced tool use validé Zod,
repli sur l'heuristique. API `/api/agents/reservation`, persistance Dexie v5. UI
`/reservations` (`ReservationsManager`) : coller → brouillon **éditable** → ajout ;
liste chronologique agrégée. **Agrégation dans l'itinéraire** : les réservations
couvrant une date apparaissent dans la journée correspondante du carnet
(`ReservationsForDay`). *Prochaine étape : collaboration, hors-ligne, calendrier (M9).*

**Export calendrier (M9a)** : générateur iCalendar pur `src/lib/calendar/ics.ts`
(RFC 5545 — échappement, repli de ligne à 75 octets, CRLF, DTEND exclusif pour
les journées entières). `tripPlanToEvents` (événements fixes horaires + nuitées)
et `reservationsToEvents` (périodes). Bouton « Calendrier .ics » dans le carnet
télécharge un fichier importable dans n'importe quel agenda. *Prochaine étape :
collaboration (vote d'activités) et robustesse hors-ligne (M9b/M9c).*

**Collaboration (M9b)** : `src/lib/collab/poll.ts` — vote d'activités par
**approbation** (chacun approuve plusieurs activités). Sondage **fusionnable**
(`mergePolls` : union déterministe, idempotente, dédupliquée des options/votes)
→ partage **sans serveur** : un lien `?poll=<lz-string>` encode l'état, et la
page fusionne les votes reçus à l'ouverture. Persistance Dexie v6. UI
`/collaboration` (`ActivityVote`) : prénom → approbation, décompte trié avec
votants, ajout d'activités, copie du lien de vote. *Prochaine étape : robustesse
hors-ligne (M9c).*

**Robustesse hors-ligne (M9c)** : socle PWA déjà en place (Serwist précache,
tuiles OSM cache-first, IndexedDB). Ajout d'une **conscience hors-ligne** :
`src/lib/offline/offline.ts` (pur) décrit honnêtement ce qui reste consultable
sans réseau (carnet, budget, bagages, réservations, vote, cartes SVG) vs.
online-only (IA, tuiles HD). `OfflineIndicator` (via `useSyncExternalStore` sur
`navigator.onLine`) affiche un bandeau hors-ligne ; la page `/offline` liste les
fonctions disponibles. *Prochaine étape : finitions a11y/perf/sécurité (M10).*

**Corrections R1** : (1) la page d'accueil n'affiche plus d'itinéraire codé en
dur (Fresnes ↔ Marseille) — un état neutre « Comment ça marche » la remplace.
(2) Le blocage de conduite **12h–16h n'est plus systématique** : il est
**conditionnel à une vigilance chaleur réelle**. Module pur
`src/lib/constraints/heat-alert.ts` (`deriveHeatAlert`, testé) déduit l'alerte
d'un ensemble de relevés (origine + destination + arrêts) ; route serveur
`/api/weather` interroge la couche météo (seed en MOCK, Open-Meteo en LIVE) sans
clé ni appel client (CSP préservée). `ChargePlanner` auto-détecte la canicule sur
le trajet, replanifie avec la surconsommation le cas échéant, et affiche
honnêtement la raison + la source ; pas d'alerte → conduite libre 12h–16h. Une
case « Forcer la vigilance canicule » permet de simuler. *Prochaine étape :
ingestion des POI ouverts (R2).*

**POI ouverts (R2)** : couche de données *quasi-statique* ingérée depuis des
jeux ouverts (Overture Maps + Foursquare OS Places) par bounding box, normalisée
vers `PoiSchema` (`src/types`), validée Zod et **embarquée** (`src/data/poi.json`,
35 lieux sur 8 villes d'étape). Interrogée **localement et hors-ligne** par
`src/lib/poi/poi.ts` (pur, testé) : `poisNear` / `poisInCity` **classent par
proximité sans jamais exclure** (anti-pattern #1) ; les horaires sont exposés
quand connus, sinon `null` — **couverture partielle honnêtement signalée**
(`openStateAt` renvoie `"unknown"`, jamais d'invention). Pipeline d'ingestion
documenté dans `scripts/ingest-poi.md` (DuckDB + GeoParquet, conflation, GERS,
mapping catégories). *Prochaine étape : adaptateur dispo hôtels (R5).*

**Recherche lieux & horaires (R3)** : page `/lieux` (`PoiSearch`) — sélection
d'une ville d'étape + types de lieux, résultats **classés par proximité** avec
horaires du jour, adresse et **source affichée** (`sourceStatus` + Overture/
Foursquare). Aucun filtre excluant ; consultable hors-ligne (données R2).

**Orchestration télétravail (R4)** : moteur pur `src/lib/workation/day-plan.ts`
(`planWorkationDay`, testé) — ne se déclenche que les **jours travaillés** du
Profil Foyer (`weekdayOf`/`isWorkDay`). Deux pistes : (1) **coworking** à
proximité, classé par distance + signaux de conformité (bureau/wifi/clim),
**jamais exclu**, manques signalés ; (2) **plan de visites famille** dimensionné
à la fenêtre de travail, respectant les pauses bébé et la **fenêtre canicule**
(intérieur privilégié 12h–16h sous vigilance chaleur). Source unique : les POI
ouverts (R2). Intégré au carnet (`WorkationTracks` dans `RoadbookClient`) : deux
pistes parallèles « Andy : coworking » / « Famille : plan de visites ».
*Prochaine étape : adaptateur dispo hôtels (R5), ménage & doc (R6).*

**Disponibilité hôtels (R5)** : adaptateur `LodgingAvailabilityProvider`
(`src/lib/lodging/availability/`) sur le patron de `VehicleProvider` —
**mock-first** (`MockLodgingAvailabilityProvider`, déterministe, hors-ligne) +
deux fournisseurs **sandbox temps réel** (données live, lecture seule, sans
réservation possible) : **LiteAPI Sandbox** (`liteapi.ts`, `LITEAPI_KEY`,
5 req/s) en primaire et **Hotelbeds APItude** env. de test (`hotelbeds.ts`,
`HOTELBEDS_API_KEY`+`HOTELBEDS_API_SECRET`, HMAC SHA-256, 50 req/jour) en
alternative. Fabrique serveur `getLodgingAvailabilityProvider()` +
`searchAvailabilityWithFallback` (repli mock honnête si quota/panne) ; cache
TTL (`CachingLodgingAvailabilityProvider`, `LODGING_AVAILABILITY_TTL_SECONDS`,
défaut 10 min) pour préserver les quotas sandbox. **Classer sans exclure** :
`rankOffers` met les disponibles en tête (prix croissant) et **conserve les
complets** (signalés). Source + fraîcheur (`readAt`) toujours affichées. API
`/api/lodging/availability` ; UI `/hebergements` (`LodgingAvailabilitySearch`).

**Amadeus retiré** : (1) portail Self-Service **décommissionné le 17 juillet
2026** ; (2) son env. Test renvoyait des **données statiques cachées** — le
`sourceStatus: "verified"` qu'on y collait était un mensonge (anti-pattern #3).
Les API hôtels en production sont par construction réservées aux entreprises
(modèle économique pub/commission incompatible avec un grand public) — les
sandbox suffisent au cas d'usage **read-only** d'Odyssée. **Booking.com Demand
API et TripAdvisor Content API restent hors périmètre** (approbation business).

**Ménage & doc (R6)** : `.env.example` mis à jour (LiteAPI + Hotelbeds,
Amadeus retiré, TTL dispo) ; `TESLA_ACCESS_TOKEN` marqué **dev-only**
(redondant avec l'OAuth — à retirer de Vercel, action ops hors dépôt).
`CLAUDE.md` reflète les décisions R1→R6.

**Principe d'architecture (handoff R1→R6)** : l'IA **orchestre**, l'app
**vérifie**. On sépare la donnée *quasi-statique* (lieux, horaires, adresses →
jeux de données ouverts ingérés, servis hors-ligne) de la donnée *temps réel*
(dispo + prix hôtels → API à palier gratuit derrière un adaptateur, read-only,
mock-first). `sourceStatus` : `seed` = pré-embarqué (jeu ouvert / seed),
`estimated` = calculé par l'app, `verified` = récupéré en direct au moment de la
requête.

**Synthèse de voyage (S1–S6)** : Odyssée n'est plus seulement un *éditeur*
d'itinéraire mais un *synthétiseur*. À partir d'une **ancre** (événement à date
fixe), d'**envies** et du Profil Foyer, l'app **compose** plusieurs voyages datés
(**dates de début/fin calculées**, pas saisies). Cœur **pur** sous
`src/lib/synthesis/` (dépendances par **injection**, `adapters.ts`) ; seul point
de couture avec R1–R6 = `wiring.ts` (durées réalistes `estimateRealisticLeg`,
vigilance chaleur via la couche météo). **S1** solveur heuristique « Ancre &
Orbite » (`solver.ts`, daté/faisable, pauses bébé, blocage 12h–16h sous alerte
seulement). **S2** multi-candidats par ambiance (`candidates.ts`/`scoring.ts` —
Reposant/Sociable/Découvreur/Thématique, classés sans exclure, regret exposé).
**S3** cadran de dates (`date-flex.ts`) + événements datés OpenAgenda
(`src/lib/providers/events/`, mock/live). **S4** `curateSlot` transforme les
créneaux de contrainte (pause bébé, charge, canicule, jour travaillé) en
opportunités classées sans exclure. **S5** graphe social local
(`people-store.ts` → Dexie v7 `people`, personnes-ancres souples, ambiance
Sociable). **S6** récit IA *barde, pas inventeur* (`narrative.ts` — prompt +
repli gabarit gratuit, n'expose que les faits du JSON validé) ; route
`/api/synthesis/narrative` (Claude `claude-sonnet-4-6` en live, repli gabarit
sans clé) + bouton « Enrichir le récit (IA) » dans le Mode B de `/plan`. API
`/api/synthesis`. Mock-first, validé Zod (`schemas.ts`), fixtures
`src/data/synthesis-fixtures.ts`.

**Durcissement du solveur (S7)** : `src/lib/synthesis/optimizer.ts` (pur,
déterministe, testé). (1) **Sélection optimale** — sac à dos 0/1 **exact**
(`knapsack`, DP) maximisant le poids d'ambiance sous un budget de temps de
visite ; personnes **forcées** (ancres souples S5). (2) **Alignement exact de
l'ancre** — `layoutAligned` épingle l'ancre sur sa date réelle (calendrier
d'abord) et ne fait rouler le foyer **que les jours non travaillés**.
`generateCandidates` utilise désormais `selectOptimal` + `layoutAligned` ; le
glouton V1 (`solver.ts`) reste pour repli/tests. **Note OR-Tools** : non importé —
distribué en binaires natifs (pas d'npm maintenu), il ne se construit pas en CI
ni sur le serverless ; l'optimisation est donc faite en TS pur (knapsack DP),
exacte sur ce modèle. **Backend ILP optionnel** (`ilp.ts`, glpk.js / GLPK WASM,
import dynamique serveur) activable par `SYNTHESIS_SOLVER=ilp` — testé à parité
exacte avec le DP, repli DP si le WASM échoue.

## Commandes essentielles

```bash
npm run dev          # Dev server (Turbopack, port 3000)
npm run build        # Build production
npm run test         # Vitest unit tests
npm run typecheck    # TypeScript strict check
npm run lint         # ESLint + a11y
npm run verify       # Pipeline qualité complet
```

## Architecture

- **Stack** : Next.js 16 App Router + TypeScript strict + Tailwind v4 + Serwist PWA
- **Persistance** : IndexedDB via Dexie (aucun serveur)
- **Cartes** : MapLibre GL + tuiles OSM + SVG autonomes offline
- **Validation** : Zod partout aux frontières
- **Agents IA** : API Claude via `/api/agents/*` (mode MOCK sans clé)

## Conventions

- Composants : PascalCase, un fichier par composant
- Modules métier : `src/lib/` — pur TypeScript, testable unitairement
- Seed data : `src/data/*.json` typés et validés par Zod
- `sourceStatus` : `"seed" | "estimated" | "verified"` — toujours affiché
- Langue UI : **français** uniquement
- `NEXT_PUBLIC_APP_MODE` : `"mock"` (défaut) ou `"live"`

## Anti-patterns INTERDITS

1. **Filtres excluants** sur les hébergements — on classe par score, on n'élimine pas
2. **Conclure à l'absence** d'un établissement sur un seul échec de recherche — retenter par variantes/zone
3. **Afficher une donnée non vérifiée comme vérifiée** — `sourceStatus` est obligatoire
4. **Contraste < 4,5:1** pour tout texte (y compris secondaire/badges) — WCAG AA
5. **TODO/stub/lorem ipsum** — chaque feature est complète ou absente

## Variables d'environnement

```
ANTHROPIC_API_KEY       # Claude API (optionnel → mode MOCK)
OPENCHARGEMAP_API_KEY   # Open Charge Map (optionnel → seed)
NEXT_PUBLIC_APP_MODE    # "mock" | "live" (défaut: "mock")
LITEAPI_KEY             # Dispo hôtels R5 — primaire, LiteAPI Sandbox (optionnel → mock)
HOTELBEDS_API_KEY       # Dispo hôtels R5 — alternative, Hotelbeds APItude env. test
HOTELBEDS_API_SECRET    # Secret HMAC Hotelbeds, serveur uniquement
HOTELBEDS_USE_TEST_ENV  # "false" pour cibler la prod (entreprises) ; défaut "true"
LODGING_AVAILABILITY_TTL_SECONDS  # TTL cache dispo hôtels (défaut 600) — préserve quotas sandbox
OPENAGENDA_PUBLIC_KEY   # Événements datés synthèse S3 (optionnel → mock)
SYNTHESIS_SOLVER        # "ilp" → backend GLPK (glpk.js) ; sinon DP exact (défaut)
TESLA_CLIENT_ID         # OAuth Fleet API (flux authorization_code) — voir docs/TESLA.md
TESLA_CLIENT_SECRET     # OAuth Fleet API, serveur uniquement
TESLA_REDIRECT_URI      # .../api/tesla/callback (enregistrée côté Tesla Developer)
TESLA_TOKEN_SECRET      # Clé AES-256-GCM chiffrant les jetons en cookie httpOnly
TESLA_FLEET_API_BASE    # Base Fleet API régionale (optionnel → découverte auto via /users/region)
TESLA_ACCESS_TOKEN      # Override dev : jeton statique, serveur uniquement (optionnel)
TESLA_PUBLIC_KEY_PEM    # Clé publique de domaine servie sous /.well-known (optionnel)
TESLA_STATE_CACHE_TTL_SECONDS  # TTL du cache d'état véhicule (défaut 300) — plafonne le coût Fleet API
```

**OAuth Tesla complet (LIVE)** : flux `authorization_code` dans `/api/tesla/*`
(`login` → consentement Tesla → `callback`), jetons access+refresh **chiffrés
AES-256-GCM** dans un cookie httpOnly (`src/lib/vehicle/tesla-session.ts`),
**rafraîchis automatiquement** avec rotation, base régionale découverte via
`/api/1/users/region` (corrige le 403 « wrong region »), enregistrement de
domaine via `/api/tesla/partner/register`. Commandes confort/charge legacy
(`/api/vehicle/command`) — véhicules pré-2021 (ex. Raven) ; sinon l'app signale
honnêtement l'exigence de commandes signées. Mock-first préservé (mode `mock`
sans aucun secret). Guide complet : `docs/TESLA.md`.

**Coût Fleet API (Tesla)** : la Fleet API facture chaque lecture `vehicle_data`
et tout appel de statut < 500 (un sondage à la minute ≈ 10 $/mois/véhicule ;
remise de 10 $/mois par compte). `CachingVehicleProvider` (`src/lib/vehicle/cache.ts`)
met en cache liste + état pendant `TESLA_STATE_CACHE_TTL_SECONDS` (défaut 5 min) :
au plus **une lecture facturable par véhicule et par fenêtre**, quel que soit le
nombre de recalculs d'itinéraire. Aucun réveil (`wake_up`), aucune relance sur
erreur facturable. Le `readAt` reste honnête (fraîcheur affichée).

## Structure clé

```
src/
  lib/
    charging/     # Modèle de recharge Tesla (pur, testé)
    providers/    # Routing, geocoding, weather, chargers
    agents/       # Orchestrateur + agents spécialisés
  types/          # Schémas Zod + types inférés
  data/           # Seed JSON (Annexe A)
  components/
    ui/           # Composants atomiques
    wizard/       # Formulaire profil & voyage
    roadbook/     # Calendrier + étapes
    lodging/      # Panel hébergements
    map/          # MapLibre + SVG
  app/
    api/agents/   # Routes serverless agents
    plan/         # Page génération
    carnet/       # Carnet de route
    parametres/   # Profil & préférences
```
