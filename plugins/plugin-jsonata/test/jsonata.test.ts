import { describe, expect, it } from "vitest"
import { Registry } from "@executioncontrolprotocol/core"
import { parseCapabilityMetadata } from "@executioncontrolprotocol/core/types"
import {
  registerJsonataExtension,
  jsonataExtension,
  jsonataTransformInputSchema,
  runJsonataTransform,
} from "../src/index.js"

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = jsonataExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

const ctx = {
  extensionConfig: {},
  usage: { increment: () => undefined },
}

describe("@executioncontrolprotocol/plugin-jsonata", () => {
  it("registers the extension and exposes transform", async () => {
    const registry = new Registry()
    await registerJsonataExtension(registry)
    const ext = registry.getExtension("@executioncontrolprotocol/jsonata")
    expect(ext).toBe(jsonataExtension)
    expect(ext?.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/jsonata.transform",
    ])
    expect(ext?.capabilities[0]?.execution).toBe("local")
  })

  it("documents useCases and projections for projecting complex objects", () => {
    const meta = parseCapabilityMetadata(jsonataExtension.capabilities[0]!.metadata)
    expect(meta.useCases.some((u) => /project|inspect|fetch|nested/i.test(u))).toBe(true)
    expect(meta.projections.length).toBeGreaterThanOrEqual(2)
    expect(meta.projections.some((p) => /fact bag|fields needed|evaluated result/i.test(p.summary))).toBe(
      true
    )
    expect(jsonataExtension.metadata?.useCases?.some((u) => /bulky|nested|reshape/i.test(u))).toBe(
      true
    )
  })

  it("transform projects object fields", async () => {
    const out = (await capability("@executioncontrolprotocol/jsonata.transform")(
      {
        expression: '{ "name": name, "total": price * qty }',
        payload: { name: "Ada", price: 10, qty: 3 },
      },
      ctx
    )) as { result: unknown }
    expect(out.result).toEqual({ name: "Ada", total: 30 })
  })

  it("transform applies optional bindings", async () => {
    const out = (await capability("@executioncontrolprotocol/jsonata.transform")(
      {
        expression: "total * $factor",
        payload: { total: 100 },
        bindings: { factor: 2 },
      },
      ctx
    )) as { result: unknown }
    expect(out.result).toBe(200)
  })

  it("transform returns undefined result for empty filter matches", async () => {
    const out = (await capability("@executioncontrolprotocol/jsonata.transform")(
      {
        expression: "items[price > 100]",
        payload: { items: [{ price: 10 }, { price: 20 }] },
      },
      ctx
    )) as { result: unknown }
    expect(out.result).toBeUndefined()
  })

  it("rejects empty expression via schema", () => {
    const parsed = jsonataTransformInputSchema.safeParse({
      expression: "",
      payload: {},
    })
    expect(parsed.success).toBe(false)
  })

  it("throws on invalid JSONata expression", async () => {
    await expect(
      runJsonataTransform({
        expression: "{{ invalid",
        payload: {},
      })
    ).rejects.toThrow(/Invalid JSONata expression/)
  })

  it("throws when evaluation fails", async () => {
    await expect(
      runJsonataTransform({
        expression: '$error("boom")',
        payload: {},
      })
    ).rejects.toThrow(/JSONata evaluation failed/)
  })

  it("registerJsonataExtension is idempotent", async () => {
    const registry = new Registry()
    await registerJsonataExtension(registry)
    await registerJsonataExtension(registry)
    expect(registry.getExtension("@executioncontrolprotocol/jsonata")).toBe(jsonataExtension)
  })
})
