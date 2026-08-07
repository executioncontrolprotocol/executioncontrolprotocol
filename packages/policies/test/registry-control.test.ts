import { describe, expect, it } from "vitest"
import { createUsageLedger } from "@executioncontrolprotocol/core"
import type { PolicyContext } from "@executioncontrolprotocol/core"
import { registryControlPolicy } from "../src/registry-control.js"
import type { RegistryRegistrationRequest } from "@executioncontrolprotocol/types"

async function evalPre(
  config: Record<string, unknown>,
  registryRequest: RegistryRegistrationRequest
): Promise<import("@executioncontrolprotocol/types").PolicyDecision | void> {
  const hook = registryControlPolicy.hooks.find((h) => h.event === "policy:pre")
  if (!hook) throw new Error("missing policy:pre")
  const ctx: PolicyContext & { config: Record<string, unknown> } = {
    workflow: {
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "stub" },
      steps: [],
    },
    run: { id: "run", input: {} },
    step: { id: "registry-check", capabilityId: "registry.registerExtension" },
    state: {},
    input: {},
    usage: createUsageLedger(),
    scope: "environment",
    registryRequest,
    config,
  }
  return (await hook.handler(ctx as never)) as import("@executioncontrolprotocol/types").PolicyDecision | void
}

describe("@executioncontrolprotocol/registry-control", () => {
  it("allows extension in allowed namespace", async () => {
    const decision = await evalPre(
      { allowedExtensionNamespaces: ["@customer/*"] },
      { kind: "extension", id: "@customer/demo" }
    )
    expect(decision).toEqual({ type: "allow" })
  })

  it("denies extension outside allowed namespace", async () => {
    const decision = await evalPre(
      { allowedExtensionNamespaces: ["@customer/*"] },
      { kind: "extension", id: "@executioncontrolprotocol/memory" }
    )
    expect(decision?.type).toBe("deny")
  })

  it("deny wins over allow", async () => {
    const decision = await evalPre(
      {
        allowedExtensionNamespaces: ["@customer/*"],
        deniedExtensionNamespaces: ["@customer/unsafe"],
      },
      { kind: "extension", id: "@customer/unsafe" }
    )
    expect(decision?.type).toBe("deny")
  })

  it("denies policy registration via registry request", async () => {
    const decision = await evalPre({}, { kind: "policy", id: "@executioncontrolprotocol/budget" })
    expect(decision?.type).toBe("deny")
  })

  it("denies when allowDynamicExtensionRegistration is false", async () => {
    const decision = await evalPre(
      { allowDynamicExtensionRegistration: false },
      { kind: "extension", id: "@customer/demo" }
    )
    expect(decision?.type).toBe("deny")
  })

  it("denies auto-bind when allowAutoBind is false", async () => {
    const decision = await evalPre(
      { allowAutoBind: false },
      { kind: "extension", id: "@customer/demo", autoBindRequested: true }
    )
    expect(decision?.type).toBe("deny")
  })
})
