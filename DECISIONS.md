# Décisions techniques — Odyssée

| # | Décision | Raison | Alternative écartée |
|---|----------|--------|---------------------|
| 1 | Hébergement Vercel par défaut | Routes API Next.js serverless avec secrets, zéro config | Cloudflare Pages (adapter non-standard, complexité additionnelle) |
| 2 | MapLibre GL avec tuiles OSM raster | Gratuit, open-source, pas de clé API, supporte offline avec cache | Leaflet (moins performant sur mobile), Mapbox (payant) |
| 3 | Dexie pour IndexedDB | API promise native, TypeScript natif, transactions, aucun serveur | SQLite (via wa-sqlite, plus complexe à bundler) |
| 4 | Mode MOCK déterministe sans clé API | Démonstration immédiate, seed Annexe A complet | Stub réseau (moins représentatif) |
| 5 | Agents Claude via /api/agents/* | Isolation, logging, retry zod, budget tokens par requête | Appels directs depuis composants (impossible côté client) |
| 6 | Score multi-critères transparent (poids visibles) | Anti-pattern filtres excluants : on classe, on n'élimine pas | Filtres prix/équipement (perdrait des options valides) |
| 7 | SVG autonome par étape en fallback offline | Imprimable, zéro dépendance réseau, généré côté serveur | Capture de tuiles (volume, droits) |
| 8 | lz-string pour partage par URL | Aucun serveur, voyage encodé dans l'URL | Partage via backend (complexité, coût, vie privée) |
| 9 | Serwist pour PWA | Wrapper typé de Workbox pour Next.js App Router | next-pwa (moins maintenu pour Next 16) |
| 10 | Vitest pour tests unitaires | Compatible ESM/TypeScript natif, rapide, pas de config Jest | Jest (setup plus complexe avec ESM/Next.js) |
| 11 | Tailwind v4 (via postcss) | Déjà bundlé par create-next-app v16, performant | Tailwind v3 (ancienne génération) |
| 12 | Grignan exclu télétravail → visite seule | 5G SFR insuffisante (~29 Mbit/s) selon dataset ARCEP | Garder comme base (risque coupure lors de réunions) |
| 13 | `VehicleProvider` derrière fabrique mock/Tesla, appelé côté serveur uniquement | Démontrable sans clé (mock déterministe), tokens jamais exposés au client, lecture SoC ponctuelle (jamais de polling) | Appel Tesla direct depuis le client (fuite de token, CORS, coût par requête) |
| 14 | `RoutePlanner` maison déterministe (option B) plutôt qu'API VE externe (option A) | Zéro dépendance/clé externe, testable sur fixtures, contrôle total du modèle de charge | API ABRP (qualité immédiate mais clé payante, non déterministe en CI, point de blocage) |
| 15 | Sélection Supercharger par détour réel `d(O→C)+d(C→D)−d(O→D)` | Robuste aux coudes autoroutiers (A6/A7) ; l'écart perpendiculaire à la corde droite excluait Dijon/Beaune (faux « hors corridor ») | Écart perpendiculaire à la ligne droite (sous-estime les itinéraires courbes) |
