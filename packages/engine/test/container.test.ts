import { describe, expect, it } from "vitest"
import { createEnvironment, defineService, ServiceError, unimplementedOperations, type ServiceContext } from "../src/index.js"

const Home = defineService<{ id: string }>("@executioncontrolprotocol/test-home")
const Formatter = defineService<{ id: string }>("@executioncontrolprotocol/test-formatter", { multiple: true })

function impl(id: string, hooks?: {
  construct?: (ctx: ServiceContext) => void
  start?: (ctx: ServiceContext) => void
  stop?: () => void
}): new (ctx: ServiceContext) => { id: string } {
  return class {
    static readonly id = id
    readonly id = id
    private readonly ctx: ServiceContext
    constructor(ctx: ServiceContext) {
      this.ctx = ctx
      hooks?.construct?.(ctx)
    }
    async start(): Promise<void> {
      hooks?.start?.(this.ctx)
    }
    async stop(): Promise<void> {
      hooks?.stop?.()
    }
  }
}

describe("service container", () => {
  it("starts the only implementation and stops it", async () => {
    const order: string[] = []
    const Started = impl("one", {
      start: () => {
        order.push("start")
      },
      stop: () => {
        order.push("stop")
      },
    })
    const host = await createEnvironment().use(Started, Home).start({ home: "/tmp/ecp" })
    expect(host.services.get(Home)).toMatchObject({ id: "one" })
    expect(host.services.has(Home)).toBe(true)
    expect(host.settings.defaultMaxConcurrency).toBe(4)
    expect(host.settings.expression.timeoutMs).toBe(50)
    await host.stop()
    expect(order).toEqual(["start", "stop"])
  })

  it("rejects a second single-service registration and a second default", () => {
    const A = impl("a")
    const B = impl("b")
    expect(() => createEnvironment().use(A, Home).use(B, Home)).toThrow(ServiceError)
    try {
      createEnvironment().use(A, Home).use(B, Home)
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError)
      expect((error as ServiceError).code).toBe("ECP_SERVICE_DUPLICATE")
    }
    expect(() =>
      createEnvironment().use(A, Formatter, { default: true }).use(B, Formatter, { default: true }),
    ).toThrow(ServiceError)
  })

  it("returns the default and rejects an ambiguous get", async () => {
    const A = impl("a")
    const B = impl("b")
    const host = await createEnvironment()
      .use(A, Formatter)
      .use(B, Formatter, { default: true })
      .start({ home: "/tmp/ecp" })
    expect(host.services.get(Formatter).id).toBe("b")
    expect(host.services.get(Formatter, "a").id).toBe("a")
    expect(host.services.getAll(Formatter)).toHaveLength(2)
    const ambiguous = await createEnvironment().use(A, Formatter).use(B, Formatter).start({ home: "/tmp/ecp" })
    expect(() => ambiguous.services.get(Formatter)).toThrow(ServiceError)
    try {
      ambiguous.services.get(Formatter)
    } catch (error) {
      expect((error as ServiceError).code).toBe("ECP_SERVICE_AMBIGUOUS")
    }
  })

  it("names the token and known ids when a service is missing", async () => {
    const host = await createEnvironment().use(impl("only"), Formatter).start({ home: "/tmp/ecp" })
    expect(() => host.services.get(Home)).toThrow(/@executioncontrolprotocol\/test-home/)
    expect(() => host.services.get(Home)).toThrow(/\(none\)/)
    expect(() => host.services.get(Formatter, "missing")).toThrow(/only/)
    expect(host.services.has(Formatter, "missing")).toBe(false)
    expect(host.services.has(Home)).toBe(false)
  })

  it("rejects lookup from a constructor and from start", async () => {
    const Early = impl("early", {
      construct: (ctx) => {
        ctx.services.get(Home)
      },
    })
    await expect(createEnvironment().use(Early, Home).start({ home: "/tmp/ecp" })).rejects.toMatchObject({
      code: "ECP_SERVICE_LOOKUP_TOO_EARLY",
    })
    const DuringStart = impl("during", {
      start: (ctx) => {
        ctx.services.get(Home)
      },
    })
    await expect(createEnvironment().use(DuringStart, Home).start({ home: "/tmp/ecp" })).rejects.toMatchObject({
      code: "ECP_SERVICE_LOOKUP_TOO_EARLY",
    })
  })

  it("stops in reverse registration order and still stops the rest when one throws", async () => {
    const order: string[] = []
    const A = impl("a", {
      stop: () => {
        order.push("a")
      },
    })
    const B = impl("b", {
      stop: () => {
        order.push("b")
        throw new Error("b failed")
      },
    })
    const C = impl("c", {
      stop: () => {
        order.push("c")
      },
    })
    const host = await createEnvironment().use(A, Formatter).use(B, Formatter).use(C, Formatter).start({ home: "/tmp/ecp" })
    await expect(host.stop()).rejects.toThrow("b failed")
    expect(order).toEqual(["c", "b", "a"])
  })

  it("rejects a second start and reports that operations are not implemented", async () => {
    const env = createEnvironment()
    const host = await env.start({
      home: "/tmp/ecp",
      mode: "server",
      defaultStepTimeoutMs: 5,
      defaultMaxConcurrency: 2,
      expression: { timeoutMs: 10, memoryBytes: 100, maxResultBytes: 100 },
      extraPlugins: ["plugins/plugin-test"],
      logLevel: "debug",
    })
    expect(host.settings.mode).toBe("server")
    expect(host.settings.defaultStepTimeoutMs).toBe(5)
    expect(host.settings.defaultMaxConcurrency).toBe(2)
    expect(host.settings.expression.timeoutMs).toBe(10)
    expect(host.settings.extraPlugins).toEqual(["plugins/plugin-test"])
    expect(host.settings.logLevel).toBe("debug")
    await expect(env.start({ home: "/tmp/ecp" })).rejects.toMatchObject({ code: "ECP_SERVICE_DUPLICATE" })
    const Late = impl("late")
    expect(() => env.use(Late, Home)).toThrow(ServiceError)
    const Loud = impl("loud", {
      construct: (ctx) => {
        ctx.logger.debug("d")
        ctx.logger.info("i")
        ctx.logger.warn("w")
        ctx.logger.error("e")
      },
    })
    const loud = await createEnvironment().use(Loud, Home).start({ home: "/tmp/ecp" })
    await loud.stop()
    await expect(unimplementedOperations().retrieve({ type: "capability" })).rejects.toMatchObject({
      code: "ECP_INTERNAL",
    })
    await expect(unimplementedOperations().execute({ execution: { path: "x.ecp.json" } })).rejects.toMatchObject({
      code: "ECP_INTERNAL",
    })
    await expect(unimplementedOperations().commit({ type: "execution", action: "create" })).rejects.toMatchObject({
      code: "ECP_INTERNAL",
    })
    await host.stop()
  })
})
