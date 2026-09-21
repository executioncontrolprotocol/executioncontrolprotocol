import { describe, expect, it, beforeEach } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
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

describe("@executioncontrolprotocol/jsonata", () => {
  beforeEach(async () => {
    await registerJsonataExtension()
  })

  it("registers the extension and exposes transform", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/jsonata")
    expect(ext).toBe(jsonataExtension)
    expect(ext?.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/jsonata.transform",
    ])
    expect(ext?.capabilities[0]?.execution).toBe("local")
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
    await registerJsonataExtension()
    await registerJsonataExtension()
    expect(globalRegistry.getExtension("@executioncontrolprotocol/jsonata")).toBe(
      jsonataExtension
    )
  })
})
