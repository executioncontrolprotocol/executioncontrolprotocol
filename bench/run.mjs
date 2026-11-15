/**
 * Benchmark runner. Phase 0 records early proxy numbers in REALIGNMENT-PLAN.md.
 * B1–B7 run once the CLI exists (Phase 5). Until budgets are set, this exits 0.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { platform } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const date = new Date().toISOString().slice(0, 10)
const outDir = path.join(root, "bench", "results")
mkdirSync(outDir, { recursive: true })
const result = {
  date,
  os: platform(),
  budgetsEnforced: false,
  note: "Budgets are set in Phase 5 after B1–B7. This run records that the harness exists.",
  scenarios: [],
}
const file = path.join(outDir, `${date}-${platform()}.json`)
writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
console.log(`bench: no budgets yet; wrote ${path.relative(root, file)}`)
