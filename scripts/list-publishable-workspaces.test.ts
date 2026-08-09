import { describe, expect, it } from "vitest"
import {
  listPublishableWorkspaces,
  topoSortPublishable,
  repoRoot,
} from "./list-publishable-workspaces.mjs"

describe("listPublishableWorkspaces", () => {
  it("includes nested extensions/runtimes/harnesses and skips private evals", () => {
    const packages = listPublishableWorkspaces(repoRoot())
    const names = new Set(packages.map((p) => p.name))

    expect(names.has("@executioncontrolprotocol/types")).toBe(true)
    expect(names.has("@executioncontrolprotocol/format-toon")).toBe(true)
    expect(names.has("@executioncontrolprotocol/node")).toBe(true)
    expect(names.has("@executioncontrolprotocol/harnesses-browser-nano")).toBe(true)
    expect(names.has("@executioncontrolprotocol/evals")).toBe(false)

    const versions = new Set(packages.map((p) => p.version))
    expect(versions.size).toBe(1)
  })

  it("topo-sorts so dependents follow their workspace deps", () => {
    const ordered = topoSortPublishable(listPublishableWorkspaces(repoRoot()))
    const index = new Map(ordered.map((p, i) => [p.name, i]))

    expect(index.get("@executioncontrolprotocol/types")!).toBeLessThan(
      index.get("@executioncontrolprotocol/core")!,
    )
    expect(index.get("@executioncontrolprotocol/core")!).toBeLessThan(
      index.get("@executioncontrolprotocol/node")!,
    )
    expect(index.get("@executioncontrolprotocol/node")!).toBeLessThan(
      index.get("@executioncontrolprotocol/cli")!,
    )
    expect(index.get("@executioncontrolprotocol/extension-memory")!).toBeLessThan(
      index.get("@executioncontrolprotocol/extensions")!,
    )
  })
})
