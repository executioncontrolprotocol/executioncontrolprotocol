import { describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { relayLog } from "../src/log.js"

describe("relayLog", () => {
  it("appends to logs/relay.log under home", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-relay-log-"))
    try {
      relayLog(home, "hello")
      const text = readFileSync(path.join(home, "logs", "relay.log"), "utf8")
      expect(text).toContain("hello")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
