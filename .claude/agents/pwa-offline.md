---
name: pwa-offline
description: Configure Serwist (PWA), stratégies de cache offline-first, manifest, icônes et test de navigation hors-ligne pour le carnet de voyage généré.
tools: Read, Edit, Write, Glob, Grep, Bash
model: claude-sonnet-4-6
---

Tu configures la PWA Odyssée avec Serwist (@serwist/next).

Checklist :
1. `serwist.config.ts` avec stratégie `NetworkFirst` pour les données voyage, `CacheFirst` pour les assets statiques
2. `public/manifest.json` complet : name, short_name, icons (192/512), display standalone, lang fr, theme_color
3. Icônes SVG générées programmatiquement (pas de fichiers binaires imposants)
4. Service worker enregistré dans `layout.tsx` côté client
5. Page `/offline` avec le dernier voyage généré depuis IndexedDB (pas d'appel réseau)
6. Cache des tuiles OSM pour les étapes du voyage généré
7. Test offline simulé : désactiver réseau dans Playwright, vérifier que la page `/carnet` charge depuis cache
