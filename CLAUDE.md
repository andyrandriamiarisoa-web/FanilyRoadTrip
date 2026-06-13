# Odyssée — Carnet de route PWA

Application PWA mobile-first en français pour planifier un voyage en Tesla Model S Raven avec contraintes familiales et médicales.

## État d'avancement

| Lot | Sujet | Statut |
|-----|-------|--------|
| P0–P6 | Fondations, charge Tesla, providers, agents, carte, hébergements, PWA, CI/CD | ✅ mergé |
| M1 | **Profil Foyer éditable & versionné** (IndexedDB, consommé par le planificateur) | ✅ |
| M3 | **Connexion Tesla mock-first** (`VehicleProvider`, sélection véhicule, lecture SoC ponctuelle) | ✅ |

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
