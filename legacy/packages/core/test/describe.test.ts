import { describe, expect, it } from "vitest"
import { extension, policy, testExtension } from "../src/index.js"
import { budgetPolicy } from "@executioncontrolprotocol/plugin-budget"
import { createTestEnvironment } from "./helpers.js"

describe("environment.describe", () => {
  it("filters policies section", async () => {
    const env = createTestEnvironment("d").with([
      extension(testExtension, "T").with({}),
      policy(budgetPolicy, "B").with({ maxModelCalls: 1 }),
    ])

    const ecp = await env.init()
    const desc = await ecp.describe({
      policies: { match: "budget", include: ["id", "summary"] },
    })
    expect(desc.policies.length).toBeGreaterThan(0)
    expect(desc.policies[0]?.id).toBe("@executioncontrolprotocol/budget")
  })
})
