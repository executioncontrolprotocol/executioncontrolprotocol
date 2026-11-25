import { describe, expect, it } from "vitest"
import { shouldKillRegisteredProcess } from "../../../test/e2e/host-process-registry.js"

describe("host process registry match", () => {
  const entry = {
    pid: 42_000,
    role: "supervisor" as const,
    home: "/tmp/ecp-home",
    entryPath: "C:\\repo\\packages\\host\\dist\\supervisor.js",
    createdAtMs: 1_700_000_000_000,
  }

  it("does not kill when command line is from another checkout", () => {
    expect(
      shouldKillRegisteredProcess(entry, {
        commandLine: `node D:\\other\\packages\\host\\dist\\supervisor.js`,
        createdAtMs: entry.createdAtMs,
      }),
    ).toBe(false)
  })

  it("does not kill when creation time mismatches", () => {
    expect(
      shouldKillRegisteredProcess(entry, {
        commandLine: `node ${entry.entryPath}`,
        createdAtMs: entry.createdAtMs + 60_000,
      }),
    ).toBe(false)
  })

  it("kills when command line and creation time match", () => {
    expect(
      shouldKillRegisteredProcess(entry, {
        commandLine: `node ${entry.entryPath}`,
        createdAtMs: entry.createdAtMs,
      }),
    ).toBe(true)
  })
})