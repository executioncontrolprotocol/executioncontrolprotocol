import { describe, expect, it } from "vitest"
import type { Interfaces } from "@oclif/core"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/core/types"
import { findMissingPlugins } from "../src/lib/missing-plugins.js"

function mockConfig(
  plugins: Array<{ name: string; version?: string; id?: string }>
): Interfaces.Config {
  return {
    getPluginsList: () =>
      plugins.map((plugin) => ({
        name: plugin.name,
        root: "/tmp",
        pjson: plugin.id ? { ecp: { id: plugin.id } } : {},
        version: plugin.version,
      })),
  } as unknown as Interfaces.Config
}

describe("findMissingPlugins", () => {
  it("skips built-ins", () => {
    const missing = findMissingPlugins(
      {
        schema: "@executioncontrolprotocol.requirements",
        version: LATEST_ECP_VERSION,
        requirements: [{ kind: "extension", id: "@executioncontrolprotocol/test", source: "inferred" }],
      },
      mockConfig([])
    )
    expect(missing).toEqual([])
  })

  it("reports missing packages with an install command", () => {
    const missing = findMissingPlugins(
      {
        schema: "@executioncontrolprotocol.requirements",
        version: LATEST_ECP_VERSION,
        requirements: [
          {
            kind: "extension",
            id: "@executioncontrolprotocol/jsonata",
            package: "@executioncontrolprotocol/plugin-jsonata",
            range: "^1.0.0",
            source: "inferred",
          },
        ],
      },
      mockConfig([])
    )
    expect(missing).toEqual([
      {
        id: "@executioncontrolprotocol/jsonata",
        package: "@executioncontrolprotocol/plugin-jsonata",
        range: "^1.0.0",
        reason: "missing",
        command: "ecp plugins install @executioncontrolprotocol/plugin-jsonata@^1.0.0",
      },
    ])
  })

  it("reports an installed plugin outside the pinned range", () => {
    const missing = findMissingPlugins(
      {
        schema: "@executioncontrolprotocol.requirements",
        version: LATEST_ECP_VERSION,
        requirements: [
          {
            kind: "extension",
            id: "@executioncontrolprotocol/jsonata",
            package: "@executioncontrolprotocol/plugin-jsonata",
            range: "^2.0.0",
            source: "explicit",
          },
        ],
      },
      mockConfig([{ name: "@executioncontrolprotocol/plugin-jsonata", version: "1.0.0" }])
    )
    expect(missing[0]?.reason).toBe("version")
  })
})
