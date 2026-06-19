# Odyssée — Carnet de route PWA

Application PWA mobile-first en français pour planifier un voyage routier multi-étapes sur mesure pour une famille avec :
- **Tesla Model S Raven** (recharge Superchargeurs uniquement)
- **Bébé 6 mois** (pauses 90–120 min, pas de conduite 12h–16h en canicule)
- **Spondylarthrite** (matelas ferme obligatoire, climatisation)
- **Télétravail lun–jeu 8h30–19h** (bureau ≥120 cm, fibre + 5G SFR)

Voyage de référence : **Fresnes (94) ↔ Marseille** — mariage le 8 août 2026.

📖 **[Guide d'utilisation](docs/GUIDE.md)** · ⚙️ **[Mode d'emploi de configuration](docs/INSTALLATION.md)** · 🔒 **[Sécurité](SECURITY.md)**

---

## Démarrage rapide

```bash
npm install
cp .env.example .env.local   # optionnel — mode MOCK fonctionne sans clé
npm run dev                  # → http://localhost:3000
npm run verify               # pipeline qualité complète
```

## Variables d'environnement

```bash
ANTHROPIC_API_KEY=sk-ant-...    # Clé Claude API (optionnel → mode MOCK)
OPENCHARGEMAP_API_KEY=...       # Open Charge Map (optionnel → seed)
NEXT_PUBLIC_APP_MODE=mock       # "mock" (défaut) | "live"
TESLA_FLEET_API_BASE=...        # Base Fleet API régionale (optionnel → mock)
TESLA_ACCESS_TOKEN=...          # Jeton Fleet API, serveur uniquement (optionnel)
TESLA_PUBLIC_KEY_PEM=...        # Clé publique de domaine (/.well-known) (optionnel)
TESLA_STATE_CACHE_TTL_SECONDS=300  # TTL cache d'état véhicule (plafonne le coût Fleet API)
```

> Toutes les clés sont **serveur uniquement** et ne sont jamais exposées au
> client. Voir [`SECURITY.md`](SECURITY.md).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de développement (port 3000) |
| `npm run build` | Build production |
| `npm run typecheck` | TypeScript strict (zéro erreur) |
| `npm run lint` | ESLint + a11y |
| `npm run test` | Vitest — 219 tests unitaires |
| `npm run verify` | typecheck + lint + test + contraste + build |
| `npm run contrast-audit` | Audit WCAG AA des couleurs du thème |
| `npm run e2e` | Playwright — smoke + audit a11y (axe-core) |

## Déploiement Vercel (défaut)

```bash
npm i -g vercel && vercel login
vercel deploy --prod
```

Variables à configurer dans le dashboard Vercel : `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_MODE`.

## Alternatives

**Cloudflare Pages + Workers** : installer `@opennextjs/cloudflare` et `wrangler`, configurer `wrangler.toml`, puis `npx wrangler pages deploy .next`.

**Netlify** : build command `npm run build`, publish directory `.next`, ajouter les env vars dans l'UI ou via `netlify deploy --prod --dir=.next`.

## Fonctionnalités

- **Mode MOCK complet** sans aucune clé API — entièrement démontrable hors-ligne
- **Profil Foyer** éditable & versionné (IndexedDB), consommé par le planificateur
- **Connexion Tesla** (mock-first) : sélection véhicule, lecture SoC ponctuelle + cache TTL
- **Routage charge-aware** : Superchargeurs only, SoC départ réel/cible → arrivée cible
- **Fusion des contraintes** : pauses bébé, blocage canicule 12h–16h, évitement télétravail, chronologie heure par heure
- **Hébergements & workation** : conformité bureau/clim/5G/matelas, classement sans exclusion
- **Génération IA** (Claude `claude-sonnet-4-6`, forced tool use → JSON validé Zod, mock-first)
- **Budget** (ventilation + découpage Lambus), **bagages** bébé-aware, **import réservations**
- **Collaboration** : vote d'activités partageable par URL (sans serveur)
- **Export calendrier .ics**, **hors-ligne** robuste, **PWA** (manifest, service worker, page offline)
- Thème nuit/clair, **contraste WCAG AA** vérifié + **audit a11y axe-core** (zéro violation critique)
- En-têtes de sécurité (CSP/HSTS/…), clés serveur uniquement

Détails d'usage : **[docs/GUIDE.md](docs/GUIDE.md)**. Décisions d'architecture :
**[DECISIONS.md](DECISIONS.md)**. État d'avancement : **[CLAUDE.md](CLAUDE.md)**.
