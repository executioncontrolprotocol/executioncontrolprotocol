import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  defineExtension,
  definePolicy,
  environment,
  extension,
  policy,
  hook,
  NODE_ENVIRONMENT_ID,
} from "../src/index.js"
import { createTestEnvironment } from "./helpers.js"

describe("environment(id).with([...])", () => {
  createTestEnvironment("with-boot")

  it("binds an extension and a policy with labels", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "with-ext")
      .withCapabilities([])
      .build()
    const pol = definePolicy("@executioncontrolprotocol", "with-pol")
      .withHooks([hook("policy:pre", () => ({ type: "allow" as const }))])
      .build()

    const env = createTestEnvironment("with-label").with([
      extension(ext, "ExtLabel"),
      policy(pol, "PolLabel").with({ n: 1 }),
    ])
    const ecp = await env.init()
    const desc = await ecp.describe()
    expect(ecp.id).toBe(NODE_ENVIRONMENT_ID)
    expect(ecp.label).toBe("with-label")
    expect(desc.extensions.some((e) => e.id === ext.id && e.label === "ExtLabel")).toBe(true)
    expect(desc.policies.some((p) => p.id === pol.id && p.label === "PolLabel")).toBe(true)
    await ecp.terminate()
  })

  it("implicitly binds registry-control", async () => {
    const env = createTestEnvironment("implicit-rc")
    const ecp = await env.init()
    const desc = await ecp.describe()
    expect(desc.policies.some((p) => p.id === "@executioncontrolprotocol/registry-control")).toBe(
      true
    )
    await ecp.terminate()
  })

  it("isolates registries across two environments in one process", async () => {
    const extA = defineExtension("@executioncontrolprotocol", "iso-a")
      .withCapabilities([])
      .build()
    const extB = defineExtension("@executioncontrolprotocol", "iso-b")
      .withCapabilities([])
      .build()

    const envA = environment(NODE_ENVIRONMENT_ID, "iso-a").with([extension(extA)])
    const envB = environment(NODE_ENVIRONMENT_ID, "iso-b").with([extension(extB)])
    await envA.init()
    await envB.init()

    expect(envA.getRegistry().getExtension(extA.id)).toBeDefined()
    expect(envA.getRegistry().getExtension(extB.id)).toBeUndefined()
    expect(envB.getRegistry().getExtension(extB.id)).toBeDefined()
    expect(envB.getRegistry().getExtension(extA.id)).toBeUndefined()
  })

  it("shallow-merges extension config by id and keeps policies additive", async () => {
    const ext = defineExtension("@executioncontrolprotocol", "merge-ext")
      .withConfig({ a: z.string().optional(), b: z.string().optional() })
      .withCapabilities([])
      .build()
    const pol = definePolicy("@executioncontrolprotocol", "merge-pol")
      .withHooks([hook("policy:pre", () => ({ type: "allow" as const }))])
      .build()
    const env = createTestEnvironment("merge").with([
      extension(ext).with({ a: "one", b: "keep" }),
      policy(pol).with({ n: 1 }),
    ])
    env.with([extension(ext).with({ a: "two" }), policy(pol).with({ n: 2 })])
    const ecp = await env.init()
    const merged = env.ecpResolveBindings().extensions.find((e) => e.id === ext.id)
    expect(merged?.config).toMatchObject({ a: "two", b: "keep" })
    const policies = env.ecpResolveBindings().policies.filter((p) => p.id === pol.id)
    expect(policies.length).toBeGreaterThanOrEqual(2)
    await ecp.terminate()
  })
})
