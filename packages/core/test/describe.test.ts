import { describe, expect, it, beforeEach } from "vitest"
import { extension, policy } from "../src/index.js"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { createTestEnvironment } from "./helpers.js"

describe("environment.describe", () => {
  beforeEach(async () => {
    await registerStandardPolicies()
  })

  it("filters policies section", async () => {
    const env = (await createTestEnvironment("d")).withExtensions([
      extension("@executioncontrolprotocol/test", "T").with({}),
    ])
      .withPolicies([policy("@executioncontrolprotocol/budget", "B").with({ maxModelCalls: 1 })])

    const ecp = await env.init()
    const desc = await ecp.describe({
      policies: { match: "budget", include: ["id", "summary"] },
    })
    expect(desc.policies.length).toBeGreaterThan(0)
    expect(desc.policies[0]?.id).toBe("@executioncontrolprotocol/budget")
  })
})
