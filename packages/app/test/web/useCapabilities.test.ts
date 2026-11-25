import type { CapabilityEntry, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  manifestCapabilityUses,
  mergeCapabilityCatalog,
} from "../../src/web/hooks/useCapabilities.js"

describe("manifestCapabilityUses", () => {
  it("collects distinct uses ids", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "a", uses: "@x/a", input: {}, as: "a" },
        { id: "b", uses: "@x/b", input: {}, as: "b" },
        { id: "c", uses: "@x/a", input: {}, as: "c" },
      ],
    }
    expect(manifestCapabilityUses(manifest)).toEqual(["@x/a", "@x/b"])
  })

  it("returns empty when there is no manifest", () => {
    expect(manifestCapabilityUses(undefined)).toEqual([])
  })
})

describe("mergeCapabilityCatalog", () => {
  const light: CapabilityEntry = {
    id: "@x/a",
    plugin: "@x/p",
    package: "@x/p",
    pluginVersion: "1.0.0",
    summary: "light",
    description: "",
    useCases: [],
    projections: [],
  }
  const full: CapabilityEntry = {
    ...light,
    accepts: { type: "object", properties: { v: { type: "string" } } },
    returns: { type: "object", properties: { out: { type: "string" } } },
  }

  it("merges full accepts when the list row omitted schemas", () => {
    const catalog = mergeCapabilityCatalog([light], { "@x/a": full }, ["@x/a"])
    expect(catalog.byId["@x/a"]?.accepts).toEqual(full.accepts)
    expect(catalog.schemas["@x/a"]?.accepts).toEqual(full.accepts)
  })

  it("keeps unknown uses as absent without throwing", () => {
    const catalog = mergeCapabilityCatalog([light], {}, ["@x/missing"])
    expect(catalog.schemas["@x/missing"]).toBeUndefined()
    expect(catalog.byId["@x/missing"]).toBeUndefined()
  })

  it("drops cached full entries when uses shrinks", () => {
    const withFull = mergeCapabilityCatalog([light], { "@x/a": full }, ["@x/a"])
    expect(withFull.schemas["@x/a"]).toBeDefined()
    const shrunk = mergeCapabilityCatalog([light], { "@x/a": full }, [])
    expect(shrunk.schemas["@x/a"]).toBeUndefined()
  })

  it("grows the schema index when a new id fetch arrives", () => {
    const bLight: CapabilityEntry = {
      id: "@x/b",
      plugin: "@x/p",
      package: "@x/p",
      pluginVersion: "1.0.0",
      summary: "B",
      description: "",
      useCases: [],
      projections: [],
    }
    const bFull: CapabilityEntry = {
      ...bLight,
      accepts: { type: "object", properties: { n: { type: "integer" } } },
    }
    const first = mergeCapabilityCatalog([light, bLight], {}, ["@x/a"])
    expect(first.schemas["@x/b"]).toBeUndefined()
    const second = mergeCapabilityCatalog([light, bLight], { "@x/b": bFull }, ["@x/a", "@x/b"])
    expect(second.schemas["@x/b"]?.accepts).toEqual(bFull.accepts)
    expect(second.schemas["@x/a"]?.accepts).toBeUndefined()
  })
})