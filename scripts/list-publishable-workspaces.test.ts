import { describe, expect, it } from "vitest"
import {
  listPublishableWorkspaces,
  topoSortPublishable,
  repoRoot,
} from "./list-publishable-workspaces.mjs"

describe("listPublishableWorkspaces", () => {
  it("includes nested extensions and runtimes", () => {
    const packages = listPublishableWorkspaces(repoRoot())
    const names = new Set(packages.map((p) => p.name))

    expect(names.has("@executioncontrolprotocol/core")).toBe(true)
    expect(names.has("@executioncontrolprotocol/types")).toBe(false)
    expect(names.has("@executioncontrolprotocol/plugin-format-toon")).toBe(true)
    expect(names.has("@executioncontrolprotocol/node")).toBe(true)
    expect(names.has("@executioncontrolprotocol/cli")).toBe(true)
    expect(names.has("@executioncontrolprotocol/plugin-sdk")).toBe(true)
    expect(names.has("@executioncontrolprotocol/plugin-jsonata")).toBe(true)
    expect(names.has("@executioncontrolprotocol/plugin-fal")).toBe(true)
    expect(names.has("@executioncontrolprotocol/plugin-image-sharp")).toBe(true)
    expect(names.has("@executioncontrolprotocol/plugin-azure-blob-storage")).toBe(true)
    expect(names.has("@executioncontrolprotocol/fal")).toBe(false)
    expect(names.has("@executioncontrolprotocol/image-sharp")).toBe(false)
    expect(names.has("@executioncontrolprotocol/azure-blob-storage")).toBe(false)
    expect(names.has("@executioncontrolprotocol/evals")).toBe(false)
    expect(names.has("@executioncontrolprotocol/harnesses-browser-nano")).toBe(false)
    expect(names.has("@executioncontrolprotocol/format-eql")).toBe(false)
    expect(names.has("@executioncontrolprotocol/chrome-ai")).toBe(false)
    expect(names.has("@executioncontrolprotocol/browser-secrets")).toBe(false)

    const byName = new Map(packages.map((p) => [p.name, p.version]))
    expect(byName.get("@executioncontrolprotocol/core")).toBe("1.0.0-next.0")
    expect(byName.get("@executioncontrolprotocol/cli")).toBe("1.0.0-next.0")
    expect(byName.get("@executioncontrolprotocol/plugin-jsonata")).toBe("1.0.0-next.0")
    expect(byName.get("@executioncontrolprotocol/mcp")).toBe("0.14.1")
  })

  it("topo-sorts so dependents follow their workspace deps", () => {
    const ordered = topoSortPublishable(listPublishableWorkspaces(repoRoot()))
    const index = new Map(ordered.map((p, i) => [p.name, i]))

    expect(index.get("@executioncontrolprotocol/core")!).toBeLessThan(
      index.get("@executioncontrolprotocol/node")!,
    )
    expect(index.get("@executioncontrolprotocol/node")!).toBeLessThan(
      index.get("@executioncontrolprotocol/cli")!,
    )
    expect(index.get("@executioncontrolprotocol/plugin-sdk")!).toBeLessThan(
      index.get("@executioncontrolprotocol/cli")!,
    )
    expect(index.get("@executioncontrolprotocol/plugin-sdk")!).toBeLessThan(
      index.get("@executioncontrolprotocol/plugin-jsonata")!,
    )
    expect(index.get("@executioncontrolprotocol/core")!).toBeLessThan(
      index.get("@executioncontrolprotocol/plugin-format-toon")!,
    )
  })
})
