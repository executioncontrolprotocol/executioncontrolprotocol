import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const pairs = [
  ["fixtures/v1/01-echo.ecp.json", "examples/echo/echo.ecp.json"],
  ["fixtures/v1/02-weekly-brief.ecp.json", "examples/weekly-brief/weekly-brief.ecp.json"],
  ["fixtures/v1/08-branch-loop.ecp.json", "examples/branch-loop/branch-loop.ecp.json"],
  ["fixtures/v1/dogfood-01-reshape.ecp.json", "examples/dogfood-reshape/reshape.ecp.json"],
  ["fixtures/v1/dogfood-02-photo.ecp.json", "examples/dogfood-photo/photo.ecp.json"],
  ["fixtures/v1/dogfood-03-caption.ecp.json", "examples/dogfood-caption/caption.ecp.json"],
]

for (const [from, to] of pairs) {
  mkdirSync(path.dirname(path.join(root, to)), { recursive: true })
  const raw = JSON.parse(readFileSync(path.join(root, from), "utf8"))
  const out = {
    $schema: "https://executioncontrolprotocol.dev/schemas/execution.schema.json",
    ...raw,
  }
  writeFileSync(path.join(root, to), `${JSON.stringify(out, null, 2)}\n`)
}
console.log(`wrote ${pairs.length} examples`)
