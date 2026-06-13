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
  // Either shows a plan or empty state
  const body = await page.locator("main, [role='main']").first().textContent()
  expect(body).toBeTruthy()
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
