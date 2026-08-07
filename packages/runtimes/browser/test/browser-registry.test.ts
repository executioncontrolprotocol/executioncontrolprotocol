import { describe, expect, it } from "vitest"
import {
  defineExtension,
  capabilityFor,
  RegistryFrozenError,
  policy,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { createBrowserTestEnvironment } from "./helpers.js"

describe("@executioncontrolprotocol/browser-registry", () => {
  it("freezes registry on first run", async () => {
    const customerExt = defineExtension("@customer", "demo")
      .withCapabilities([
        capabilityFor("@customer/demo", "echo")
          .withInput(z.object({}))
          .withOutput(z.object({ ok: z.boolean() }))
          .withHandler(async () => ({ ok: true })),
      ])
      .build()

    const env = await createBrowserTestEnvironment("reg-test")

    const operational = await env.init()
    const globalEcp = (globalThis as { ecp?: { registerExtension: (d: typeof customerExt) => Promise<void> } })
      .ecp
    expect(globalEcp).toBeDefined()
    await globalEcp!.registerExtension(customerExt)

    const desc = await operational.describe()
    expect(desc.capabilities.some((c) => c.id === "@customer/demo.echo")).toBe(true)

    await operational.run({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "empty" },
      steps: [],
    })

    await expect(env.getRegistry().registerExtension(customerExt)).rejects.toThrow(
      RegistryFrozenError
    )
  })

  it("denies registration outside allowed namespace via registry-control", async () => {
    const env = (await createBrowserTestEnvironment("deny-test")).withPolicies([
      policy("@executioncontrolprotocol/registry-control").with({
        allowedExtensionNamespaces: ["@customer/*"],
        deniedExtensionNamespaces: [],
      }),
    ])

    await env.init()

    const ecpExt = defineExtension("@executioncontrolprotocol", "blocked")
      .withConfig({})
      .build()

    await expect(
      env.getRegistry().registerExtension(ecpExt, { source: { type: "direct-registry" } })
    ).rejects.toThrow(/not allowed|denied/i)
  })
})
