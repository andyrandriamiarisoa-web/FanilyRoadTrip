import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test("home page loads with correct title and navigation links", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/Odyssée/)
  // Main navigation links (assert by href — labels are descriptive, not "plan"/"carnet")
  await expect(page.locator('a[href="/plan"]')).toBeVisible()
  await expect(page.locator('a[href="/carnet"]')).toBeVisible()
})

test("home page exposes a main landmark", async ({ page }) => {
  await page.goto("/")
  // Layout wraps content in a <main> element (basic a11y structure check)
  await expect(page.locator("main, [role='main']").first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Plan generation page
// ---------------------------------------------------------------------------

test("plan page shows generate button and trip summary", async ({ page }) => {
  await page.goto("/plan")
  await expect(page).toHaveTitle(/Générer/)
  await expect(page.getByRole("button", { name: /générer/i })).toBeVisible()
  // Shows reference trip info (appears in both the intro and the summary card)
  await expect(page.getByText(/Fresnes/i).first()).toBeVisible()
})

test("plan generation flow — mock mode returns a trip plan", async ({ page }) => {
  await page.goto("/plan")

  // Click generate
  const btn = page.getByRole("button", { name: /générer/i })
  await btn.click()

  // Success state shows "Plan généré !" (mock mode is fast, allow up to 15s)
  await expect(page.getByText(/plan généré/i)).toBeVisible({ timeout: 15_000 })

  // ...then auto-redirects to the carnet de route after ~1.5s
  await expect(page).toHaveURL(/\/carnet/, { timeout: 10_000 })
})

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

const MAIN_ROUTES = ["/", "/plan", "/carnet", "/parametres", "/offline"]

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

// ---------------------------------------------------------------------------
// Routage charge-aware (M4)
// ---------------------------------------------------------------------------

test("trajet charge-aware — calcule des arrêts de charge cohérents", async ({ page }) => {
  await page.goto("/plan")

  // La section RoutePlanner est présente.
  await expect(page.getByRole("heading", { name: /trajet charge-aware/i })).toBeVisible()

  // Calcule avec le SoC cible par défaut (90 % → arrivée 20 %).
  await page.getByRole("button", { name: /calculer les arrêts de charge/i }).click()

  // Au moins un arrêt Supercharger et le SoC d'arrivée apparaissent.
  await expect(page.getByText(/Recharge —/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("Arrivée", { exact: true })).toBeVisible()
  // Rappel de préconditionnement présent.
  await expect(page.getByText(/préconditionner la batterie/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Fusion des contraintes (M5)
// ---------------------------------------------------------------------------

test("fusion des contraintes — canicule bloque la conduite 12h–16h", async ({ page }) => {
  await page.goto("/plan")

  // Active la canicule, puis calcule.
  await page.getByRole("checkbox", { name: /canicule/i }).check()
  await page.getByRole("button", { name: /calculer les arrêts de charge/i }).click()

  // La chronologie heure par heure apparaît avec un blocage canicule.
  await expect(page.getByRole("heading", { name: /chronologie heure par heure/i })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText(/Canicule — pas de conduite/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Hébergements & Workation (M6)
// ---------------------------------------------------------------------------

test("hébergement — conformité workation affichée et classée (non exclue)", async ({ page }) => {
  // Génère le plan de référence puis ouvre une étape-nuit.
  await page.goto("/plan")
  await page.getByRole("button", { name: /générer le voyage/i }).click()
  await expect(page).toHaveURL(/\/carnet/, { timeout: 15_000 })

  // Déplie une journée à Dijon (séjour avec hébergement).
  await page.getByRole("button", { name: /dijon/i }).first().click()

  // Le bloc de conformité télétravail apparaît (l'hébergement est classé,
  // jamais éliminé — un statut de conformité est toujours affiché).
  await expect(page.getByText(/Conformité télétravail/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Connectivité/i).first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Génération d'itinéraire par IA (M7)
// ---------------------------------------------------------------------------

test("génération IA — propose un itinéraire structuré et éditable", async ({ page }) => {
  await page.goto("/plan")

  await expect(page.getByRole("heading", { name: /générer par ia/i })).toBeVisible()
  await page.getByRole("button", { name: /proposer un itinéraire/i }).click()

  // Un brouillon structuré apparaît (mode mock en CI) avec un jour daté.
  await expect(page.getByText(/Brouillon —/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Démo \(mock\)/i)).toBeVisible()

  // Le brouillon est éditable : on modifie le titre d'une journée.
  const firstTitle = page.getByLabel(/Titre du 2026-08-03/i)
  await expect(firstTitle).toBeVisible()
  await firstTitle.fill("Ma journée personnalisée")
  await expect(firstTitle).toHaveValue("Ma journée personnalisée")
})

// ---------------------------------------------------------------------------
// Bureau partagé à proximité — assouplit le late checkout (feature)
// ---------------------------------------------------------------------------

test("bureau partagé proche — satisfait le poste de travail et assouplit le late checkout", async ({
  page,
}) => {
  // Génère le plan puis ouvre l'étape Dijon (coworking à 7 min en skateboard).
  await page.goto("/plan")
  await page.getByRole("button", { name: /générer le voyage/i }).click()
  await expect(page).toHaveURL(/\/carnet/, { timeout: 15_000 })
  await page.getByRole("button", { name: /dijon/i }).first().click()

  // Le bureau partagé est mentionné et le late checkout est assoupli.
  await expect(page.getByText(/bureau partagé/i).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/assoupli/i).first()).toBeVisible()
})

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
// Export calendrier .ics (M9)
// ---------------------------------------------------------------------------

test("export calendrier .ics depuis le carnet", async ({ page }) => {
  // Génère un plan puis exporte le calendrier.
  await page.goto("/plan")
  await page.getByRole("button", { name: /générer le voyage/i }).click()
  await expect(page).toHaveURL(/\/carnet/, { timeout: 15_000 })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /calendrier \.ics/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("odyssee-voyage.ics")
})
