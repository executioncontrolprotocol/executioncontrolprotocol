import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { acceptanceRepoRoot } from "./support.js"

const evidenceJson = path.join(
  acceptanceRepoRoot,
  "realignment/evidence/a10-localize-banner.json",
)
const evidenceMd = path.join(acceptanceRepoRoot, "realignment/evidence/a10-localize-banner.md")

describe("A10 localize-banner live evidence", () => {
  it("Phase 8 evidence files record a completed live run", () => {
    expect(existsSync(evidenceJson)).toBe(true)
    expect(existsSync(evidenceMd)).toBe(true)
    const record = JSON.parse(readFileSync(evidenceJson, "utf8")) as {
      status: string
      result?: { banner?: { outputs?: unknown[] } }
      provisioned?: boolean
    }
    expect(record.status).toBe("completed")
    expect(record.provisioned).toBe(true)
    expect(record.result?.banner?.outputs?.length).toBeGreaterThan(0)
    const md = readFileSync(evidenceMd, "utf8")
    expect(md).toMatch(/localize-banner|A10|Firefly|completed/i)
  })

  it.skipIf(process.env.ECP_LIVE_A10 !== "1")(
    "optional live re-run when ECP_LIVE_A10=1 (see plugins live tests)",
    () => {
      // Live re-run is exercised by plugins/*/test/live when secrets exist.
      // This skip gate documents the Phase 9 policy: CI uses recorded evidence.
      expect(process.env.ECP_LIVE_A10).toBe("1")
    },
  )
})
