# Odyssée — Carnet de route PWA

Application PWA mobile-first en français pour planifier un voyage routier multi-étapes sur mesure pour une famille avec :
- **Tesla Model S Raven** (recharge Superchargeurs uniquement)
- **Bébé 6 mois** (pauses 90–120 min, pas de conduite 12h–16h en canicule)
- **Spondylarthrite** (matelas ferme obligatoire, climatisation)
- **Télétravail lun–jeu 8h30–19h** (bureau ≥120 cm, fibre + 5G SFR)

Voyage de référence : **Fresnes (94) ↔ Marseille** — mariage le 8 août 2026.

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
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de développement (port 3000) |
| `npm run build` | Build production |
| `npm run typecheck` | TypeScript strict (zéro erreur) |
| `npm run lint` | ESLint + a11y |
| `npm run test` | Vitest — 63 tests unitaires |
| `npm run verify` | typecheck + lint + test + build |
| `npm run contrast-audit` | Audit WCAG AA des couleurs du thème |

## Déploiement Vercel (défaut)

```bash
npm i -g vercel && vercel login
vercel deploy --prod
```

Variables à configurer dans le dashboard Vercel : `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_MODE`.

## Alternatives

**Cloudflare Pages + Workers** : installer `@opennextjs/cloudflare` et `wrangler`, configurer `wrangler.toml`, puis `npx wrangler pages deploy .next`.

**Netlify** : build command `npm run build`, publish directory `.next`, ajouter les env vars dans l'UI ou via `netlify deploy --prod --dir=.next`.

## Fonctionnalités MVP

- Mode MOCK complet sans aucune clé API (seed Annexe A)
- Modèle de recharge Tesla : Wh/km, courbe par paliers, multi-legs
- Calendrier interactif jour par jour (trajet/télétravail/repos/événement)
- Panel hébergements : score multi-critères transparent, badges à confirmer, deep links
- Export JSON + partage par URL compressée (lz-string)
- Thème nuit/clair, contraste WCAG AA ≥ 4,5:1 vérifié (16 paires)
- PWA : manifest, service worker (production), page offline
