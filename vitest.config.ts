import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      // `json-summary` est lu par l'agent CI (scripts/agent-review.mjs) ;
      // `text-summary` reste lisible dans les logs.
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      // Seuils **planchers** (anti-régression), calibrés sous la couverture
      // actuelle (stmts 87 · branches 70 · funcs 91 · lines 90). Ils ne
      // cassent pas une PR saine mais bloquent une chute marquée. À relever
      // au fil de l'amélioration de la couverture.
      thresholds: {
        statements: 80,
        branches: 62,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
