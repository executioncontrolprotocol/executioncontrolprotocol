import { describe, expect, it } from "vitest"
import { hook, defineExtension } from "../src/index.js"
import { extension } from "../src/index.js"
import { NODE_ENVIRONMENT_ID, registerNodeEnvironment } from "@executioncontrolprotocol/node"
import { environment } from "../src/environment/environment.js"

const events: string[] = []

const spyExt = defineExtension("@executioncontrolprotocol", "env-spy")
  .withConfig({})
  .withHooks([
    hook("environment:created", async (ctx) => {
      events.push(ctx.event)
    }),
    hook("environment:configuring", async (ctx) => {
      events.push(ctx.event)
    }),
    hook("environment:ready", async (ctx) => {
      events.push(ctx.event)
    }),
    hook("environment:beforeRun", async (ctx) => {
      events.push(ctx.event)
    }),
    hook("environment:terminate", async (ctx) => {
      events.push(ctx.event)
    }),
  ])
  .build()

describe("environment lifecycle", () => {
  it("emits configuring and ready on init, beforeRun on run, terminate on terminate", async () => {
    events.length = 0
    await registerNodeEnvironment()
    const env = environment(NODE_ENVIRONMENT_ID, "evt").with([
      extension(spyExt).with({}),
    ])

    const ecp = await env.init()
    expect(events).toContain("environment:created")
    expect(events).toContain("environment:configuring")
    expect(events).toContain("environment:ready")

    events.length = 0
    await ecp.run({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "empty" },
      steps: [],
    })
    expect(events).toContain("environment:beforeRun")

    events.length = 0
    await ecp.terminate()
    expect(events).toContain("environment:terminate")
  })
})
