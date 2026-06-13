import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

/**
 * Audit d'accessibilité automatisé (M10) avec axe-core.
 *
 * On échoue sur les violations d'impact **critique** (les plus graves :
 * doublons d'id, structure cassée, pièges au clavier…) sur chaque page clé.
 * Le contraste (impact « serious ») est par ailleurs couvert par
 * `npm run contrast-audit` (WCAG AA sur tous les tokens du thème).
 */

const ROUTES = [
  "/",
  "/plan",
  "/carnet",
  "/parametres",
  "/budget",
  "/bagages",
  "/reservations",
  "/collaboration",
  "/offline",
]

for (const route of ROUTES) {
  test(`a11y axe — ${route} sans violation critique`, async ({ page }) => {
    await page.goto(route)
    // Laisse les composants client s'hydrater (formulaires, états).
    await page.locator("main, [role='main']").first().waitFor({ state: "visible" })

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()

    const critical = results.violations.filter((v) => v.impact === "critical")
    const summary = critical.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length }))
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([])
  })
}
