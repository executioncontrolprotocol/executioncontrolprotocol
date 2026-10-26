import { afterEach, describe, expect, it, vi } from "vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Interfaces } from "@oclif/core"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/core/types"
import { ECP_PLUGINS_MISSING, type EcpHost } from "@executioncontrolprotocol/plugin-sdk"

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

const testRequirements = {
  schema: "@executioncontrolprotocol.requirements" as const,
  version: LATEST_ECP_VERSION,
  requirements: [
    {
      kind: "extension" as const,
      id: "@executioncontrolprotocol/test",
      package: "@executioncontrolprotocol/plugin-test",
      source: "inferred" as const,
    },
  ],
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const TEST_ENV = join(repoRoot, "packages/cli/test/fixtures/test-extension-env.ts")

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

describe("ensurePluginsInstalled already-bound skip", () => {
  it("skips a requirement whose id is already on the host registry", async () => {
    const host = {
      registry: {
        getExtension: (id: string) =>
          id === "@executioncontrolprotocol/jsonata" ? { id } : undefined,
      },
    } as unknown as EcpHost
    await expect(
      ensurePluginsInstalled({
        requirements: jsonataRequirements,
        config: mockConfig([]),
        argv: [],
        json: true,
        install: false,
        host,
      })
    ).resolves.toBe(host)
  })

  it("skips plugin-test when --env binds testExtension", async () => {
    await expect(
      ensurePluginsInstalled({
        requirements: testRequirements,
        config: mockConfig([]),
        argv: [],
        json: true,
        install: false,
        envFlag: TEST_ENV,
      })
    ).resolves.toBeUndefined()
  }, 30_000)

  it("still reports jsonata missing when --env only binds testExtension", async () => {
    await expect(
      ensurePluginsInstalled({
        requirements: jsonataRequirements,
        config: mockConfig([]),
        argv: [],
        json: true,
        install: false,
        envFlag: TEST_ENV,
      })
    ).rejects.toMatchObject({ code: ECP_PLUGINS_MISSING })
  }, 30_000)
})
