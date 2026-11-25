import { describe, expect, expectTypeOf, it } from "vitest"
import { z } from "zod"
import {
  capability,
  CapabilityInput,
  CapabilityOutput,
  definePlugin,
  Handler,
  PluginConfig,
  PluginDefinitionError,
} from "../src/index.js"

const accepts = z.object({ value: z.string() })
const returns = z.object({ echo: z.string() })

describe("definePlugin and capability", () => {
  it("accepts a valid plugin and capability", () => {
    const echo = capability({
      summary: "Echo.",
      description: "Returns the value.",
      useCases: ["Round-trip a string"],
      projections: ["Take echo"],
      accepts,
      returns,
      handler: () => import("./fixtures/echo-handler.js"),
    })
    const plugin = definePlugin({
      id: "@executioncontrolprotocol/test",
      summary: "Test plugin.",
      description: "Fixture capabilities.",
      config: z.object({ secret: z.string().optional() }),
      capabilities: { echo },
    })
    expect(plugin.id).toBe("@executioncontrolprotocol/test")
    expect(plugin.capabilities.echo.useCases).toHaveLength(1)
  })

  it("rejects invalid plugin ids and capability keys", () => {
    const echo = capability({
      summary: "Echo.",
      description: "Returns the value.",
      useCases: ["Round-trip"],
      projections: ["Take echo"],
      accepts,
      returns,
      handler: () => import("./fixtures/echo-handler.js"),
    })
    expect(() =>
      definePlugin({
        id: "not-scoped",
        summary: "x",
        description: "y",
        capabilities: { echo },
      }),
    ).toThrow(PluginDefinitionError)
    expect(() =>
      definePlugin({
        id: "@executioncontrolprotocol/test",
        summary: "x",
        description: "y",
        capabilities: { BadKey: echo },
      }),
    ).toThrow(/Capability key/)
  })

  it("rejects missing useCases, projections, and non-function handlers", () => {
    expect(() =>
      capability({
        summary: "Echo.",
        description: "Returns the value.",
        useCases: [],
        projections: ["Take echo"],
        accepts,
        returns,
        handler: () => import("./fixtures/echo-handler.js"),
      }),
    ).toThrow(/useCases/)
    expect(() =>
      capability({
        summary: "Echo.",
        description: "Returns the value.",
        useCases: ["Round-trip"],
        projections: [],
        accepts,
        returns,
        handler: () => import("./fixtures/echo-handler.js"),
      }),
    ).toThrow(/projections/)
    expect(() =>
      capability({
        summary: "Echo.",
        description: "Returns the value.",
        useCases: ["Round-trip"],
        projections: ["Take echo"],
        accepts,
        returns,
        handler: { not: "lazy" } as never,
      }),
    ).toThrow(/lazy/)
    expect(() =>
      capability({
        summary: "",
        description: "Returns the value.",
        useCases: ["Round-trip"],
        projections: ["Take echo"],
        accepts,
        returns,
        handler: () => import("./fixtures/echo-handler.js"),
      }),
    ).toThrow(/summary and description/)
    expect(() =>
      definePlugin({
        id: "@executioncontrolprotocol/test",
        summary: "",
        description: "y",
        capabilities: {
          echo: capability({
            summary: "Echo.",
            description: "Returns the value.",
            useCases: ["Round-trip"],
            projections: ["Take echo"],
            accepts,
            returns,
            handler: () => import("./fixtures/echo-handler.js"),
          }),
        },
      }),
    ).toThrow(/Plugin needs summary/)
    expect(() =>
      definePlugin({
        id: "@executioncontrolprotocol/test",
        summary: "x",
        description: "y",
        capabilities: {},
      }),
    ).toThrow(/at least one capability/)
  })

  it("infers input, output and config types", () => {
    const echo = capability({
      summary: "Echo.",
      description: "Returns the value.",
      useCases: ["Round-trip"],
      projections: ["Take echo"],
      accepts,
      returns,
      handler: () => import("./fixtures/echo-handler.js"),
    })
    const typedPlugin = definePlugin({
      id: "@executioncontrolprotocol/test",
      summary: "Test plugin.",
      description: "Fixture capabilities.",
      config: z.object({ secret: z.string() }),
      capabilities: { echo },
    })
    expect(typedPlugin.id).toBe("@executioncontrolprotocol/test")
    type In = CapabilityInput<typeof echo>
    type Out = CapabilityOutput<typeof echo>
    type Cfg = PluginConfig<typeof typedPlugin>
    expectTypeOf<In>().toEqualTypeOf<{ value: string }>()
    expectTypeOf<Out>().toEqualTypeOf<{ echo: string }>()
    expectTypeOf<Cfg>().toEqualTypeOf<{ secret: string }>()
    type H = Handler<typeof echo>
    expectTypeOf<H>().toMatchTypeOf<(input: { value: string }, ctx: never) => Promise<{ echo: string }>>()
  })
})
