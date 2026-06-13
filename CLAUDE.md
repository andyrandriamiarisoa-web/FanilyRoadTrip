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

**Profil Foyer (M1)** : le profil de référence (`src/data/default-profile.ts`) est
copié dans IndexedDB au premier lancement, éditable depuis `/parametres`
(`ProfileSettings`), et **versionné** — chaque enregistrement incrémente `version`
et horodate `updatedAt`. La logique pure vit dans `src/lib/profile/profile.ts`
(testée), la persistance dans `src/lib/db.ts` (`loadActiveProfile`,
`saveProfilePatch`). Le `profileId` actif est transmis à `/api/agents/plan` et
estampillé sur le `TripPlan` généré. *Prochaine étape : injecter chaque champ du
profil dans le moteur de contraintes (M4/M5) plutôt que les constantes de référence.*

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

**Génération IA (M7)** : `src/lib/agents/itinerary-ai.ts` propose un itinéraire
structuré à partir d'une description en texte libre + le Profil Foyer. **Mock-first**
(`itinerary-mock.ts`, déterministe) ; en mode LIVE, appel à l'API Anthropic
(`claude-sonnet-4-6`) en **forced tool use** (`tool_choice`) pour garantir une
sortie JSON, validée par `AiItineraryDraftSchema` (Zod) — repli propre sur le mock
en cas d'erreur. Clé API serveur uniquement (`/api/agents/itinerary`). UI `/plan`
(`AiItineraryGenerator`) : description → brouillon **éditable** (titres + activités
par jour), contraintes appliquées affichées, source (Claude/mock) indiquée.
*Prochaine étape : budget, bagages, réservations (M8).*

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
TESLA_FLEET_API_BASE    # Base Fleet API régionale (optionnel → VehicleProvider mock)
TESLA_ACCESS_TOKEN      # Jeton d'accès Fleet API, serveur uniquement (optionnel)
TESLA_PUBLIC_KEY_PEM    # Clé publique de domaine servie sous /.well-known (optionnel)
```

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
