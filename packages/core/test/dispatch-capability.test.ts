import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BROWSER_RUNTIME_ID,
  capabilityFor,
  defineExtension,
  defineRuntime,
  environment,
  extension,
  globalRegistry,
  InMemoryRuntimeExecutor,
  runtime,
  workflow,
  step,
} from "../src/index.js"
import { z } from "zod"
import { registerCoreFormats } from "../src/formats/register-core-formats.js"

async function ensureBrowserRuntime(): Promise<void> {
  if (!globalRegistry.getRuntime(BROWSER_RUNTIME_ID)) {
    await globalRegistry.registerRuntime(
      defineRuntime("@executioncontrolprotocol", "browser").withExecutor(
        new InMemoryRuntimeExecutor()
      )
    )
  }
}

describe("mixed-mode dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("fails closed when a host capability has no remoteInvoke", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const hostExt = defineExtension("@executioncontrolprotocol", "dispatch-host")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-host", "ping")
          .withInput(z.object({}))
          .withOutput(z.object({ ok: z.boolean() }))
          .withExecution("host")
          .withHandler(async () => ({ ok: true })),
      ])
      .build()
    await globalRegistry.registerExtension(hostExt)

    const env = environment("browser-host-miss")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-host").with({})])
    const ecp = await env.init()
    const result = await ecp
      .invoke("@executioncontrolprotocol/dispatch-host.ping")
      .with({})
      .process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("REMOTE_INVOKE_REQUIRED")
    await ecp.terminate()
  })

  it("fails closed when mixed has no remoteInvoke", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const mixedExt = defineExtension("@executioncontrolprotocol", "dispatch-mixed")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-mixed", "upload")
          .withInput(z.object({}))
          .withOutput(z.object({ ok: z.boolean() }))
          .withExecution("mixed")
          .withHandler(async () => ({ ok: true })),
      ])
      .build()
    await globalRegistry.registerExtension(mixedExt)

    const env = environment("browser-mixed-miss")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-mixed").with({})])
    const ecp = await env.init()
    const result = await ecp
      .invoke("@executioncontrolprotocol/dispatch-mixed.upload")
      .with({})
      .process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("REMOTE_INVOKE_REQUIRED")
    await ecp.terminate()
  })

  it("hops host capabilities and rewrites missing-host diagnostics", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const hostExt = defineExtension("@executioncontrolprotocol", "dispatch-hop")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-hop", "work")
          .withInput(z.object({ n: z.number() }))
          .withOutput(z.object({ n: z.number() }))
          .withExecution("host")
          .withHandler(async () => {
            throw new Error("must not run locally")
          }),
      ])
      .build()
    await globalRegistry.registerExtension(hostExt)

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 404,
        json: async () => ({
          schema: "@executioncontrolprotocol.invoke.result",
          version: "1.0",
          success: false,
          capabilityId: "@executioncontrolprotocol/dispatch-hop.work",
          diagnostics: [
            {
              severity: "error",
              code: "CAPABILITY_NOT_FOUND",
              message: "Capability not registered",
            },
          ],
        }),
      }))
    )

    const env = environment("browser-hop")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-hop").with({})])
      .withRemoteInvoke({ url: "http://127.0.0.1:3090", token: "tok" })
    const ecp = await env.init()
    const result = await ecp
      .invoke("@executioncontrolprotocol/dispatch-hop.work")
      .with({ n: 1 })
      .process()
    expect(result.success).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("CAPABILITY_NOT_FOUND")
    expect(result.diagnostics[0]?.message).toContain("local host environment")
    expect(global.fetch).toHaveBeenCalled()
    await ecp.terminate()
  })

  it("records hop failures on workflow steps instead of swallowing them", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const hostExt = defineExtension("@executioncontrolprotocol", "dispatch-step")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-step", "work")
          .withInput(z.object({}))
          .withOutput(z.object({}))
          .withExecution("host")
          .withHandler(async () => ({})),
      ])
      .build()
    await globalRegistry.registerExtension(hostExt)

    const env = environment("browser-step")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-step").with({})])
    const ecp = await env.init()
    const manifest = workflow("hop-fail")
      .run([step("@executioncontrolprotocol/dispatch-step.work", "Work").as("out")])
      .toManifest()
    const result = await ecp.run(manifest)
    expect(result.run.status).toBe("failed")
    const failed = Object.values(result.history ?? {}).find((h) => h.status === "failed")
    expect(failed?.diagnostics?.[0]?.code).toBe("REMOTE_INVOKE_REQUIRED")
    await ecp.terminate()
  })

  it("runs mixed locally after remoteInvoke is bound and hops nested host calls", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const mixedExt = defineExtension("@executioncontrolprotocol", "dispatch-nested")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-nested", "upload")
          .withInput(z.object({}))
          .withOutput(z.object({ url: z.string() }))
          .withExecution("mixed")
          .withHandler(async (_input, ctx) => {
            const nested = (await ctx.capabilities.call(
              "@executioncontrolprotocol/dispatch-nested.mint",
              {}
            )) as { sas: string }
            return { url: nested.sas }
          }),
        capabilityFor("@executioncontrolprotocol/dispatch-nested", "mint")
          .withInput(z.object({}))
          .withOutput(z.object({ sas: z.string() }))
          .withExecution("host")
          .withHandler(async () => ({ sas: "local-must-not-run" })),
      ])
      .build()
    await globalRegistry.registerExtension(mixedExt)

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        json: async () => ({
          schema: "@executioncontrolprotocol.invoke.result",
          version: "1.0",
          success: true,
          capabilityId: "@executioncontrolprotocol/dispatch-nested.mint",
          diagnostics: [],
          result: { sas: "https://example.blob/sas" },
        }),
      }))
    )

    const env = environment("browser-nested")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-nested").with({})])
      .withRemoteInvoke({ url: "http://127.0.0.1:3090", token: "tok" })
    const ecp = await env.init()
    const result = await ecp
      .invoke("@executioncontrolprotocol/dispatch-nested.upload")
      .with({})
      .process()
    expect(result.success).toBe(true)
    expect(result.result).toEqual({ url: "https://example.blob/sas" })
    expect(global.fetch).toHaveBeenCalled()
    await ecp.terminate()
  })

  it("includes execution and remoteInvoke url on describe", async () => {
    await registerCoreFormats()
    await ensureBrowserRuntime()
    const mixedExt = defineExtension("@executioncontrolprotocol", "dispatch-desc")
      .withCapabilities([
        capabilityFor("@executioncontrolprotocol/dispatch-desc", "upload")
          .withInput(z.object({}))
          .withOutput(z.object({}))
          .withExecution("mixed")
          .withHandler(async () => ({})),
      ])
      .build()
    await globalRegistry.registerExtension(mixedExt)
    const env = environment("browser-desc")
      .withRuntime(runtime(BROWSER_RUNTIME_ID))
      .withExtensions([extension("@executioncontrolprotocol/dispatch-desc").with({})])
      .withRemoteInvoke({ url: "http://127.0.0.1:3090", token: "secret" })
    const ecp = await env.init()
    const desc = await ecp.describe()
    expect(desc.remoteInvoke).toEqual({ url: "http://127.0.0.1:3090" })
    expect(JSON.stringify(desc)).not.toContain("secret")
    const cap = desc.capabilities.find((c) => c.id === "@executioncontrolprotocol/dispatch-desc.upload")
    expect(cap?.execution).toBe("mixed")
    await ecp.terminate()
  })
})
