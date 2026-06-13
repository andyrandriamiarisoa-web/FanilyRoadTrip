#!/usr/bin/env tsx
/**
 * Validates all seed JSON files against their Zod schemas.
 * Run: npx tsx scripts/validate-seed.ts
 * Exit code 0 = all valid, 1 = at least one error.
 */

import { z } from "zod"
import { SuperchargerSchema, LodgingOptionSchema, Coverage5GSchema } from "../src/types/index"
import superchargersRaw from "../src/data/superchargers.json"
import logementsRaw from "../src/data/logements.json"
import coverageRaw from "../src/data/5g-coverage.json"

let hasError = false

function validateArray<T>(
  label: string,
  data: unknown[],
  schema: z.ZodSchema<T>
): void {
  let ok = 0
  let fail = 0
  for (const item of data) {
    const result = schema.safeParse(item)
    if (result.success) {
      ok++
    } else {
      fail++
      if (fail === 1) console.error(`\n❌  ${label}:`)
      const itemId = (item as Record<string, unknown>)?.id ?? "(no id)"
      console.error(`  item "${itemId}":`, result.error.issues.map((i) => i.message).join(", "))
      hasError = true
    }
  }
  if (fail === 0) {
    console.log(`✅  ${label}: ${ok} items valid`)
  } else {
    console.error(`    ${ok} valid, ${fail} invalid`)
  }
}

console.log("Validating seed data...\n")

validateArray("superchargers.json", superchargersRaw as unknown[], SuperchargerSchema)
validateArray("logements.json", logementsRaw as unknown[], LodgingOptionSchema)
validateArray("5g-coverage.json", coverageRaw as unknown[], Coverage5GSchema)

console.log("")

if (hasError) {
  console.error("Seed validation FAILED — fix errors above.")
  process.exit(1)
} else {
  console.log("All seed data valid ✓")
}
