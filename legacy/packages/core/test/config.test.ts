import { describe, expect, it } from "vitest"
import {
  config,
  extension,
  isConfigBuilder,
  policy,
} from "../src/index.js"

describe("config()", () => {
  it("accumulates extension and policy bindings", () => {
    const builder = config().with([extension("@executioncontrolprotocol/anthropic")])
    builder.with([policy("@executioncontrolprotocol/budget").with({ maxCostUsd: 5 })])
    const bindings = builder.getBindings()
    expect(bindings).toHaveLength(2)
    expect(bindings[0]?.getRef()).toBe("@executioncontrolprotocol/anthropic")
    expect(bindings[1]?.getRef()).toBe("@executioncontrolprotocol/budget")
    expect(bindings[1]?.getConfig()).toEqual({ maxCostUsd: 5 })
  })

  it("does not expose init", () => {
    const builder = config()
    expect(builder.kind).toBe("config")
    expect(isConfigBuilder(builder)).toBe(true)
    expect("init" in builder).toBe(false)
  })

  it("rejects environment-shaped objects as config builders", () => {
    expect(isConfigBuilder({ kind: "environment", init: () => undefined })).toBe(false)
    expect(isConfigBuilder(null)).toBe(false)
  })
})
