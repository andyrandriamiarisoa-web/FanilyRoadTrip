import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test("home page loads with correct title and navigation links", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/Odyssée/)
  // Persistent bottom navigation bar exposes the main destinations.
  // Scope to the nav landmark — /plan also appears as the hero CTA on this page.
  const nav = page.getByRole("navigation", { name: /navigation principale/i })
  await expect(nav.locator('a[href="/plan"]')).toBeVisible()
  await expect(nav.locator('a[href="/carnet"]')).toBeVisible()
})

test("home page exposes a main landmark", async ({ page }) => {
  await page.goto("/")
  // Layout wraps content in a <main> element (basic a11y structure check)
  await expect(page.locator("main, [role='main']").first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Plan — deux modes : voyage planifié (A) et voyage avec ancre (B)
// ---------------------------------------------------------------------------

test("plan page — affiche les deux modes et le sélecteur radio", async ({ page }) => {
  await page.goto("/plan");
  await expect(page).toHaveTitle(/Planifier/);

  // Sélecteur radio accessible avec les deux modes.
  const radiogroup = page.getByRole("radiogroup", { name: /choisir un mode/i });
  await expect(radiogroup).toBeVisible();
  await expect(page.getByRole("radio", { name: /voyage planifié/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /voyage avec ancre/i })).toBeVisible();

  // Mode A actif par défaut : son formulaire est visible.
  await expect(page.getByRole("heading", { name: /^voyage planifié$/i })).toBeVisible();
});

test("plan — Mode A : générer l'itinéraire (mock) produit un brouillon éditable", async ({ page }) => {
  await page.goto("/plan");

  // Mode A est actif par défaut. On remplit le formulaire.
  await page.getByLabel(/point de départ/i).fill("Paris");
  await page.getByLabel(/^destination$/i).fill("Marseille");
  await page.getByLabel(/date de départ/i).fill("2026-08-01");
  await page.getByLabel(/date de retour/i).fill("2026-08-07");

  await page.getByRole("button", { name: /générer l['’]itinéraire/i }).click();

  // Un brouillon structuré apparaît (mock en CI), avec le badge source.
  await expect(page.getByText(/Brouillon —/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Démo \(mock\)/i)).toBeVisible();

  // Le brouillon est éditable : on modifie le titre d'une journée.
  const dayTitle = page.getByLabel(/^Titre du 2026-08-/i).first();
  await expect(dayTitle).toBeVisible();
  await dayTitle.fill("Ma journée personnalisée");
  await expect(dayTitle).toHaveValue("Ma journée personnalisée");
});

test("plan — Mode B : bascule vers le formulaire d'ancre", async ({ page }) => {
  await page.goto("/plan");

  // Bascule sur Mode B et vérifie son formulaire spécifique.
  await page.getByRole("radio", { name: /voyage avec ancre/i }).click();
  await expect(page.getByRole("heading", { name: /^voyage avec ancre$/i })).toBeVisible();

  // Champs spécifiques au Mode B (ancre + fenêtre).
  await expect(page.getByLabel(/^intitulé$/i)).toBeVisible();
  await expect(page.getByLabel(/au plus tôt/i)).toBeVisible();

  // Sélecteur d'intention de voyage (remplace les min/max nuits visibles par défaut).
  await expect(
    page.getByRole("radiogroup", { name: /choisir une intention de voyage/i }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /maximiser le temps de voyage/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /au plus rapide/i })).toBeVisible();

  // Le bouton de composition est visible (désactivé tant que les champs ne sont pas remplis).
  await expect(page.getByRole("button", { name: /composer mes voyages/i })).toBeVisible();
});

test("/composer redirige vers /plan", async ({ page }) => {
  await page.goto("/composer");
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("heading", { name: /planifier un voyage/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Carnet de route page
// ---------------------------------------------------------------------------

test("carnet page renders without crashing", async ({ page }) => {
  await page.goto("/carnet")
  await expect(page).toHaveTitle(/Carnet/)
  // Assertion « web-first » qui patiente jusqu'à l'hydratation du client
  // (plan ou état vide), évitant un textContent lu trop tôt (flaky).
  await expect(page.locator("main, [role='main']").first()).toContainText(/\S/, {
    timeout: 10_000,
  })
})

// ---------------------------------------------------------------------------
// Offline fallback page
// ---------------------------------------------------------------------------

test("offline page renders with link to carnet", async ({ page }) => {
  await page.goto("/offline")
  await expect(page.getByText(/Pas de connexion/i)).toBeVisible()
  await expect(page.getByRole("link", { name: /consulter le carnet/i })).toBeVisible()
})

// ---------------------------------------------------------------------------
// PWA manifest
// ---------------------------------------------------------------------------

test("manifest.json is served with correct content-type", async ({ request }) => {
  const res = await request.get("/manifest.json")
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.name).toContain("Odyssée")
  expect(body.start_url).toBeDefined()
  expect(body.icons).toBeInstanceOf(Array)
  expect(body.icons.length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// Theme toggle (AppModeBar)
// ---------------------------------------------------------------------------

test("theme toggle switches between dark and light", async ({ page }) => {
  await page.goto("/")

  const html = page.locator("html")
  const initialClass = await html.getAttribute("class")

  // Find theme toggle button
  const toggleBtn = page.getByRole("button", { name: /thème|theme|☀|🌙|nuit|clair/i })
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click()
    const newClass = await html.getAttribute("class")
    expect(newClass).not.toBe(initialClass)
  }
})

// ---------------------------------------------------------------------------
// Navigation — all main routes respond 200
// ---------------------------------------------------------------------------

// `/composer` redirige vers `/plan` (mode B fusionné) — testé séparément.
const MAIN_ROUTES = ["/", "/plan", "/carnet", "/parametres", "/offline", "/lieux", "/hebergements"]

for (const route of MAIN_ROUTES) {
  test(`route ${route} responds 200`, async ({ request }) => {
    const res = await request.get(route)
    expect(res.status()).toBe(200)
  })
}

// ---------------------------------------------------------------------------
// Profil Foyer — éditable, versionné, persistant (M1)
// ---------------------------------------------------------------------------

test("profil foyer — édition, sauvegarde versionnée et persistance", async ({ page }) => {
  await page.goto("/parametres")

  // Le profil se charge depuis IndexedDB (graine au premier lancement).
  const ageField = page.getByLabel("Âge (mois)")
  await expect(ageField).toBeVisible()
  await expect(ageField).toHaveValue("6")

  // Édite une contrainte et enregistre.
  await ageField.fill("8")
  await page.getByRole("button", { name: /enregistrer le profil/i }).click()

  // La version est incrémentée et confirmée à l'utilisateur.
  await expect(page.getByText(/enregistré — version 2/i)).toBeVisible({ timeout: 10_000 })

  // La modification survit à un rechargement (persistance IndexedDB).
  await page.reload()
  const reloaded = page.getByLabel("Âge (mois)")
  await expect(reloaded).toHaveValue("8")
  await expect(page.getByText("v2")).toBeVisible()
})

// ---------------------------------------------------------------------------
// Connexion Tesla — mock-first (M3)
// ---------------------------------------------------------------------------

test("connexion Tesla (mock) — lister, choisir et lire le SoC", async ({ page }) => {
  await page.goto("/parametres")

  // Démarre la connexion (mode mock, aucune clé requise).
  await page.getByRole("button", { name: /connecter mon compte tesla/i }).click()

  // Un véhicule mock apparaît et indique la source « Démo (mock) ».
  await expect(page.getByText(/démo \(mock\)/i)).toBeVisible({ timeout: 10_000 })
  const vehicleBtn = page.getByRole("button", { name: /model s raven/i })
  await expect(vehicleBtn).toBeVisible()

  // Sélectionne le véhicule → lecture ponctuelle de l'état de charge.
  // Locator exact sur le libellé <dt> pour éviter la collision avec le
  // sous-titre « Lecture ponctuelle de l'état de charge… ».
  await vehicleBtn.click()
  await expect(page.getByText("État de charge", { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("Autonomie estimée", { exact: true })).toBeVisible()

  // La sélection persiste après rechargement (IndexedDB).
  await page.reload()
  await expect(page.getByText("État de charge", { exact: true })).toBeVisible({ timeout: 10_000 })
})

test("clé publique Tesla absente → 404 en mode mock", async ({ request }) => {
  const res = await request.get("/.well-known/appspecific/com.tesla.3p.public-key.pem")
  expect(res.status()).toBe(404)
})

// Note de couverture : les tests E2E qui dépendaient de l'ancien flux
// `/plan → "Générer le voyage" → /carnet` (ChargePlanner, fusion canicule,
// workation, bureau partagé, export ics, télétravail) ont été retirés avec
// la refonte de `/plan` (Mode A / Mode B). La couverture unitaire (Vitest)
// reste assurée pour `routing/`, `constraints/`, `lodging/workation` et
// `calendar/ics`. Réintroduction E2E à prévoir si un bouton « Enregistrer
// vers le carnet » est ajouté aux modes A/B.

// ---------------------------------------------------------------------------
// Budget & dépenses (M8)
// ---------------------------------------------------------------------------

test("budget — ajouter une dépense, ventilation et découpage", async ({ page }) => {
  await page.goto("/budget")
  await expect(page.getByRole("heading", { name: /budget & dépenses/i })).toBeVisible()

  // Ajoute une dépense d'hébergement payée par Parent 1, partagée.
  await page.getByLabel("Libellé").fill("Hôtel Dijon")
  await page.getByLabel("Montant en euros").fill("200")
  await page.getByLabel("Catégorie").selectOption("lodging")
  await page.getByRole("button", { name: "Ajouter" }).click()

  // La dépense apparaît dans la liste et la ventilation.
  await expect(page.getByText("Hôtel Dijon")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("heading", { name: /ventilation par poste/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: /découpage des dépenses/i })).toBeVisible()

  // La dépense persiste après rechargement (IndexedDB).
  await page.reload()
  await expect(page.getByText("Hôtel Dijon")).toBeVisible({ timeout: 10_000 })
})

// ---------------------------------------------------------------------------
// Listes de bagages bébé-aware (M8)
// ---------------------------------------------------------------------------

test("bagages — liste bébé/saison générée, cochage persistant", async ({ page }) => {
  await page.goto("/bagages")
  await expect(page.getByRole("heading", { name: /liste de bagages/i })).toBeVisible()

  // Section bébé présente avec un essentiel daté de la durée.
  await expect(page.getByRole("heading", { name: "Bébé", exact: true })).toBeVisible()
  const couches = page.getByText(/^Couches/i)
  await expect(couches.first()).toBeVisible()

  // Coche un article ; l'état persiste après rechargement.
  const litParapluie = page.getByText(/Lit parapluie/i)
  const checkbox = litParapluie.locator("xpath=ancestor::label//input[@type='checkbox']")
  await checkbox.check()
  await expect(checkbox).toBeChecked()
  await page.reload()
  const checkboxAfter = page
    .getByText(/Lit parapluie/i)
    .locator("xpath=ancestor::label//input[@type='checkbox']")
  await expect(checkboxAfter).toBeChecked()
})

// ---------------------------------------------------------------------------
// Import des réservations (M8)
// ---------------------------------------------------------------------------

test("réservations — extraction depuis un texte collé et agrégation", async ({ page }) => {
  await page.goto("/reservations")
  await expect(page.getByRole("heading", { name: "Réservations", exact: true })).toBeVisible()

  // L'exemple pré-rempli est extrait (mode mock déterministe).
  await page.getByRole("button", { name: /extraire la réservation/i }).click()
  await expect(page.getByText(/réservation extraite/i)).toBeVisible({ timeout: 10_000 })

  // Le brouillon a bien identifié l'hébergement et la date.
  await expect(page.getByLabel("Intitulé")).toHaveValue(/Chapeau Rouge/i)
  await expect(page.getByLabel("Début")).toHaveValue("2026-08-03")

  // Ajout à l'itinéraire → apparaît dans la liste agrégée, persiste au rechargement.
  await page.getByRole("button", { name: /ajouter à l'itinéraire/i }).click()
  await expect(page.getByRole("heading", { name: /itinéraire des réservations/i })).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Chapeau Rouge/i).first()).toBeVisible({ timeout: 10_000 })
})

// ---------------------------------------------------------------------------
// Collaboration — vote des activités (M9)
// ---------------------------------------------------------------------------

test("collaboration — voter pour une activité et voir le décompte", async ({ page }) => {
  await page.goto("/collaboration")
  await expect(page.getByRole("heading", { name: /vote des activités/i })).toBeVisible()

  // Sans prénom, le vote est désactivé ; on saisit un prénom.
  await page.getByLabel(/votre prénom/i).fill("Andy")

  // Approuve la première activité.
  const firstVote = page.getByRole("button", { name: /^Voter$/ }).first()
  await firstVote.click()

  // Le décompte passe à 1 vote avec le votant.
  await expect(page.getByText(/1 vote · Andy/i).first()).toBeVisible({ timeout: 10_000 })

  // L'approbation persiste après rechargement.
  await page.reload()
  await page.getByLabel(/votre prénom/i).fill("Andy")
  await expect(page.getByText(/1 vote · Andy/i).first()).toBeVisible({ timeout: 10_000 })
})

// ---------------------------------------------------------------------------
// Robustesse hors-ligne (M9)
// ---------------------------------------------------------------------------

test("hors-ligne — bandeau affiché quand la connexion tombe", async ({ page, context }) => {
  await page.goto("/")
  // En ligne : pas de bandeau hors-ligne.
  await expect(page.getByText(/votre carnet, budget, bagages/i)).toHaveCount(0)

  // Passe hors-ligne : le bandeau apparaît (réagit à l'événement offline).
  await context.setOffline(true)
  await expect(page.getByText(/hors ligne — votre carnet/i)).toBeVisible({ timeout: 10_000 })

  // Retour en ligne : le bandeau disparaît.
  await context.setOffline(false)
  await expect(page.getByText(/hors ligne — votre carnet/i)).toHaveCount(0, { timeout: 10_000 })
})

test("page hors-ligne — liste des fonctions disponibles", async ({ page }) => {
  await page.goto("/offline")
  await expect(page.getByText(/disponible hors-ligne/i)).toBeVisible()
  await expect(page.getByText(/Carnet de route/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Lieux & horaires sur données ouvertes (R3)
// ---------------------------------------------------------------------------

test("lieux — recherche de POI ouverts avec horaires et source", async ({ page }) => {
  await page.goto("/lieux")
  await expect(page.getByRole("heading", { name: /lieux & horaires/i })).toBeVisible()

  // Sélectionne Lyon (couverte par le seed) et vérifie des résultats classés.
  await page.getByLabel(/ville d'étape/i).selectOption("lyon")
  await expect(page.getByText(/classés par proximité/i)).toBeVisible()
  await expect(page.getByText(/Musée des Confluences/i)).toBeVisible({ timeout: 10_000 })
  // La source est affichée (anti-pattern #3) et un horaire « Aujourd'hui ».
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Disponibilité hébergements (R5)
// ---------------------------------------------------------------------------

test("hébergements — recherche dispo mock, classée, source affichée, sans réservation", async ({
  page,
}) => {
  await page.goto("/hebergements")
  await expect(page.getByRole("heading", { name: /disponibilités hébergements/i })).toBeVisible()

  // Recherche par défaut (Marseille 7–9/08/2026).
  await page.getByRole("button", { name: /rechercher les disponibilités/i }).click()

  // Des établissements apparaissent avec une source affichée (anti-pattern #3).
  await expect(page.getByText(/source : mock/i)).toBeVisible({ timeout: 10_000 })
  // Une offre concrète (carte résultat) est visible — un statut dispo/complet.
  await expect(page.getByText(/^(Disponible|Complet)$/).first()).toBeVisible()

  // Aucune action de réservation exposée (read-only strict).
  await expect(page.getByRole("button", { name: /réserver|booking|payer/i })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /réserver|booking/i })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Synthèse de voyage — Mode B sur /plan (S1–S3, S6)
// ---------------------------------------------------------------------------

test("plan — Mode B : compose plusieurs voyages datés à partir d'une ancre", async ({
  page,
}) => {
  await page.goto("/plan");
  await page.getByRole("radio", { name: /voyage avec ancre/i }).click();

  // Renseigne une ancre simple : mariage à Marseille le 8 août 2026.
  // L'ancre supporte maintenant un bloc multi-jour (Du / Au) — pour un
  // événement ponctuel, on laisse Au = Du (recalé automatiquement par
  // l'UI quand on saisit Du).
  await page.getByLabel(/^intitulé$/i).fill("Mariage Marseille");
  await page.getByLabel(/^ville$/i).fill("Marseille");
  await page.getByLabel(/^du$/i).fill("2026-08-08");

  await page.getByLabel(/point de départ \(domicile\)/i).fill("Paris");
  await page.getByLabel(/au plus tôt/i).fill("2026-08-01");
  await page.getByLabel(/au plus tard/i).fill("2026-08-14");

  // Intention par défaut : « Maximiser le temps de voyage » — le solveur
  // explore toute la fenêtre, pas besoin de saisir min/max nuits.

  await page.getByRole("button", { name: /composer mes voyages/i }).click();

  // Le solveur compose plusieurs candidats datés avec ambiances distinctes.
  await expect(page.getByRole("heading", { name: /voyages composés/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Le (Reposant|Découvreur|Sociable|Thématique)/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Durcissement sécurité — en-têtes HTTP (M10)
// ---------------------------------------------------------------------------

test("en-têtes de sécurité présents sur les réponses", async ({ page }) => {
  const response = await page.goto("/")
  const headers = response?.headers() ?? {}
  expect(headers["content-security-policy"]).toContain("default-src 'self'")
  expect(headers["content-security-policy"]).toContain("object-src 'none'")
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(headers["permissions-policy"]).toContain("geolocation=()")
})
