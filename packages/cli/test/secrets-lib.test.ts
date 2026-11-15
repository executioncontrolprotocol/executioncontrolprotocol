import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { withSecrets } from "../src/lib/secrets.js"
import { envNameForKey } from "@executioncontrolprotocol/local"

describe("cli secrets helper", () => {
  it("lists env-backed secrets through LocalSecrets", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-secrets-"))
    const prev = process.env.ECP_HOME
    process.env.ECP_HOME = home
    const key = `CLIENV${Date.now()}`
    const envName = envNameForKey(key)
    process.env[envName] = "v"
    try {
      const rows = await withSecrets(async (secrets) => secrets.listDetailed())
      expect(rows.some((row) => row.key.toUpperCase().includes("CLIENV") && row.source === "env")).toBe(true)
    } finally {
      delete process.env[envName]
      if (prev === undefined) delete process.env.ECP_HOME
      else process.env.ECP_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })
})
