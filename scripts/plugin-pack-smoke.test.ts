import { describe, expect, it } from "vitest"
import { HOST_PACK_NAMES, PLUGIN_SMOKES, parseJsonEnvelope } from "./plugin-pack-smoke.mjs"

describe("plugin-pack-smoke catalog", () => {
  it("covers all 14 first-party plugins", () => {
    expect(PLUGIN_SMOKES).toHaveLength(14)
    const names = PLUGIN_SMOKES.map((smoke) => smoke.package)
    expect(names).toEqual(
      expect.arrayContaining([
        "@executioncontrolprotocol/plugin-test",
        "@executioncontrolprotocol/plugin-jsonata",
        "@executioncontrolprotocol/plugin-adobe-firefly-services",
        "@executioncontrolprotocol/plugin-budget",
      ]),
    )
    expect(new Set(names).size).toBe(14)
  })

  it("packs the CLI host graph so install does not hit unpublished npm", () => {
    expect(HOST_PACK_NAMES).toEqual([
      "@executioncontrolprotocol/core",
      "@executioncontrolprotocol/node",
      "@executioncontrolprotocol/plugin-sdk",
      "@executioncontrolprotocol/cli",
    ])
  })

  it("uses offline --json for jsonata, formats, and image-sharp", () => {
    const byTopic = new Map(PLUGIN_SMOKES.map((smoke) => [smoke.topic, smoke]))
    expect(byTopic.get("jsonata")?.args).toEqual(
      expect.arrayContaining(["--json", "--expression", "$.a"]),
    )
    expect(byTopic.get("format-toon")?.expectJson).toBe(true)
    expect(byTopic.get("format-mermaid")?.expectJson).toBe(true)
    expect(byTopic.get("image-sharp")?.args).toEqual(expect.arrayContaining(["inspect", "--json"]))
  })

  it("policy plugins smoke describe --policies instead of a missing command topic", () => {
    for (const topic of ["budget", "approval", "state-control"]) {
      const smoke = PLUGIN_SMOKES.find((entry) => entry.topic === topic)
      expect(smoke?.args.slice(0, 2)).toEqual(["describe", "--policies"])
    }
  })
})

describe("parseJsonEnvelope", () => {
  it("reads a success envelope", () => {
    expect(parseJsonEnvelope('noise\n{"ok":true,"data":{"a":1}}\n')).toEqual({
      ok: true,
      data: { a: 1 },
    })
  })

  it("reads a failure envelope", () => {
    const body = parseJsonEnvelope('{"ok":false,"error":{"code":"ECP_PLUGINS_MISSING"}}')
    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe("ECP_PLUGINS_MISSING")
  })

  it("throws when stdout has no JSON object", () => {
    expect(() => parseJsonEnvelope("not json")).toThrow(/No JSON object/)
  })
})
