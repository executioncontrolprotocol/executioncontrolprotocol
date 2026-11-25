import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseJsonFlag } from "../src/lib/input.js"

describe("parseJsonFlag", () => {
  it("parses raw JSON and @file", async () => {
    expect(await parseJsonFlag('{"a":1}')).toEqual({ a: 1 })
    expect(await parseJsonFlag(undefined)).toBeUndefined()
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-json-"))
    try {
      const file = path.join(dir, "x.json")
      writeFileSync(file, '{"b":2}\n')
      expect(await parseJsonFlag(`@${file}`)).toEqual({ b: 2 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
