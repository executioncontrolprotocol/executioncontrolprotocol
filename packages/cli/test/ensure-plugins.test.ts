import { afterEach, describe, expect, it, vi } from "vitest"
import type { Interfaces } from "@oclif/core"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/core/types"
import { ECP_PLUGINS_MISSING } from "@executioncontrolprotocol/plugin-sdk"

const question = vi.fn(async () => "")
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question,
    close: vi.fn(),
  }),
}))

import { ensurePluginsInstalled } from "../src/lib/ensure-plugins.js"

function mockConfig(
  plugins: Array<{ name: string; version?: string }> = [],
  runCommand: (id: string, argv?: string[]) => Promise<unknown> = async () => undefined
): Interfaces.Config {
  return {
    getPluginsList: () =>
      plugins.map((plugin) => ({
        name: plugin.name,
        root: "/tmp",
        pjson: {},
        version: plugin.version,
      })),
    runCommand,
  } as unknown as Interfaces.Config
}

const jsonataRequirements = {
  schema: "@executioncontrolprotocol.requirements" as const,
  version: LATEST_ECP_VERSION,
  requirements: [
    {
      kind: "extension" as const,
      id: "@executioncontrolprotocol/jsonata",
      package: "@executioncontrolprotocol/plugin-jsonata",
      range: "^1.0.0",
      source: "inferred" as const,
    },
  ],
}

describe("ensurePluginsInstalled TTY prompt", () => {
  const stdinDesc = Object.getOwnPropertyDescriptor(process.stdin, "isTTY")
  const stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")

  afterEach(() => {
    question.mockReset()
    if (stdinDesc) Object.defineProperty(process.stdin, "isTTY", stdinDesc)
    else delete (process.stdin as { isTTY?: boolean }).isTTY
    if (stdoutDesc) Object.defineProperty(process.stdout, "isTTY", stdoutDesc)
    else delete (process.stdout as { isTTY?: boolean }).isTTY
  })

  it("prompts per package on a TTY and installs the accepted spec", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true })
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true })
    question.mockResolvedValueOnce("")
    const installed: string[] = []
    const config = mockConfig([], async (id, argv) => {
      installed.push(`${id} ${argv?.[0] ?? ""}`)
    })
    await expect(
      ensurePluginsInstalled({
        requirements: jsonataRequirements,
        config,
        argv: [],
        json: false,
        install: true,
      })
    ).rejects.toMatchObject({ code: ECP_PLUGINS_MISSING })
    expect(question).toHaveBeenCalledTimes(1)
    expect(String(question.mock.calls[0]?.[0])).toMatch(/plugin-jsonata/)
    expect(installed.some((row) => row.includes("plugins:install") && row.includes("plugin-jsonata"))).toBe(
      true
    )
  })
})
