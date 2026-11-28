import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveAppRoot } from "../src/http/resolve-app-root.js"

describe("resolveAppRoot", () => {
  it("returns an existing override directory", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-app-root-"))
    try {
      expect(resolveAppRoot(dir)).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns undefined for a missing override", () => {
    const dir = path.join(os.tmpdir(), "ecp-app-root-missing", String(Date.now()))
    expect(resolveAppRoot(dir)).toBeUndefined()
  })

  it("resolves the workspace app bundle when no override is given", () => {
    const root = resolveAppRoot()
    expect(root).toBeDefined()
    if (!root) return
    writeFileSync(path.join(root, ".probe"), "")
    rmSync(path.join(root, ".probe"))
  })

})