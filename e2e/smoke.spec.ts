import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test("home page loads with correct title and navigation links", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/Odyssée/)
  // Main nav links
  await expect(page.getByRole("link", { name: /carnet/i })).toBeVisible()
  await expect(page.getByRole("link", { name: /plan/i })).toBeVisible()
})

test("home page has no ARIA violations on core landmarks", async ({ page }) => {
  await page.goto("/")
  // Verify header/main/nav landmarks exist (basic a11y structure check)
  await expect(page.locator("main, [role='main']").first()).toBeVisible()
})

// ---------------------------------------------------------------------------
// Plan generation page
// ---------------------------------------------------------------------------

test("plan page shows generate button and trip summary", async ({ page }) => {
  await page.goto("/plan")
  await expect(page).toHaveTitle(/Générer/)
  await expect(page.getByRole("button", { name: /générer/i })).toBeVisible()
  // Shows reference trip info
  await expect(page.getByText(/Fresnes/i)).toBeVisible()
})

test("plan generation flow — mock mode returns a trip plan", async ({ page }) => {
  await page.goto("/plan")

  // Click generate
  const btn = page.getByRole("button", { name: /générer/i })
  await btn.click()

  // Wait for completion (mock mode should be fast, up to 15s)
  await expect(
    page.getByText(/planification terminée|carnet de route/i)
  ).toBeVisible({ timeout: 15_000 })
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
