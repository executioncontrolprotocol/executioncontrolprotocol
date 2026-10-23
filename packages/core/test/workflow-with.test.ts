import { describe, expect, it } from "vitest"
import {
  branch,
  capabilityToExtensionId,
  collectCapabilityIds,
  extension,
  inferredPackageName,
  isBuiltinRequirementId,
  loop,
  parallel,
  policy,
  secrets,
  step,
  workflow,
  ECP_BINDING_INVALID,
} from "../src/index.js"
import { EcpError } from "../src/types/index.js"

describe("workflow().with() and requirements()", () => {
  it("keeps compile() free of bindings", () => {
    const wf = workflow("Brief")
      .with([
        extension("@executioncontrolprotocol/openai")
          .requires("^1.0.0")
          .with({ apiKey: secrets("openai/api-key") }),
      ])
      .run([
        step("@executioncontrolprotocol/openai.generate", "Ask").with({ prompt: "hi" }).as("out"),
      ])
    const manifest = wf.compile()
    expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    expect(JSON.stringify(manifest)).not.toContain("$secret")
    expect(JSON.stringify(manifest)).not.toContain("apiKey")
  })

  it("records explicit bindings and infers packages", () => {
    const req = workflow("Brief")
      .with([
        extension("@executioncontrolprotocol/openai")
          .requires("^1.0.0")
          .with({ apiKey: secrets("openai/api-key") }),
        policy("@executioncontrolprotocol/budget").requires("^2.0.0", "@acme/plugin-budget"),
      ])
      .run([
        step("@executioncontrolprotocol/openai.generate", "Ask").with({ prompt: "hi" }).as("out"),
      ])
      .requirements()

    expect(req.schema).toBe("@executioncontrolprotocol.requirements")
    expect(req.version).toBe("1.0")
    const openai = req.requirements.find((r) => r.id === "@executioncontrolprotocol/openai")
    expect(openai).toMatchObject({
      kind: "extension",
      package: "@executioncontrolprotocol/plugin-openai",
      range: "^1.0.0",
      source: "explicit",
    })
    expect(openai?.config).toEqual({ apiKey: { $secret: "openai/api-key" } })
    const budget = req.requirements.find((r) => r.id === "@executioncontrolprotocol/budget")
    expect(budget).toMatchObject({
      kind: "policy",
      package: "@acme/plugin-budget",
      range: "^2.0.0",
      source: "explicit",
    })
  })

  it("infers missing extensions from leaf and flow nodes", () => {
    const req = workflow("Flows")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo").with({ value: 1 }).as("e"),
        parallel([
          [step("@executioncontrolprotocol/jsonata.transform", "A").with({ expression: "$" })],
          [step("@acme/mail.send", "B")],
        ]),
        branch([step("@vendor/search.query", "C")]),
        loop({ until: { eq: ["done", true] } }, [
          step("@executioncontrolprotocol/openai.generate", "D"),
        ]),
      ])
      .requirements()

    const byId = Object.fromEntries(req.requirements.map((r) => [r.id, r]))
    expect(byId["@executioncontrolprotocol/test"]?.package).toBeUndefined()
    expect(byId["@executioncontrolprotocol/test"]?.source).toBe("inferred")
    expect(byId["@executioncontrolprotocol/jsonata"]).toMatchObject({
      package: "@executioncontrolprotocol/plugin-jsonata",
      source: "inferred",
    })
    expect(byId["@acme/mail"]).toMatchObject({
      package: "@acme/plugin-mail",
      source: "inferred",
    })
    expect(byId["@vendor/search"]).toMatchObject({
      package: "@vendor/plugin-search",
      source: "inferred",
    })
    expect(byId["@executioncontrolprotocol/openai"]).toMatchObject({
      package: "@executioncontrolprotocol/plugin-openai",
      source: "inferred",
    })
  })

  it("lets explicit .with() win over inference for the same id", () => {
    const req = workflow("Win")
      .with([extension("@executioncontrolprotocol/jsonata").requires(">=0.1.0")])
      .run([step("@executioncontrolprotocol/jsonata.transform", "T")])
      .requirements()
    expect(req.requirements).toHaveLength(1)
    expect(req.requirements[0]).toMatchObject({
      id: "@executioncontrolprotocol/jsonata",
      range: ">=0.1.0",
      source: "explicit",
    })
  })

  it("rejects a second .with() call", () => {
    expect(() =>
      workflow("Once")
        .with([extension("@executioncontrolprotocol/jsonata")])
        .with([extension("@executioncontrolprotocol/openai")])
    ).toThrow(EcpError)
    try {
      workflow("Once")
        .with([extension("@executioncontrolprotocol/jsonata")])
        .with([extension("@executioncontrolprotocol/openai")])
    } catch (err) {
      expect(err).toBeInstanceOf(EcpError)
      expect((err as EcpError).code).toBe(ECP_BINDING_INVALID)
    }
  })
})

describe("requirement id mapping", () => {
  it("maps capability ids to extension ids and packages", () => {
    expect(capabilityToExtensionId("@executioncontrolprotocol/jsonata.transform")).toBe(
      "@executioncontrolprotocol/jsonata"
    )
    expect(inferredPackageName("@executioncontrolprotocol/jsonata")).toBe(
      "@executioncontrolprotocol/plugin-jsonata"
    )
    expect(isBuiltinRequirementId("@executioncontrolprotocol/test")).toBe(true)
    expect(inferredPackageName("@executioncontrolprotocol/test")).toBeUndefined()
    expect(inferredPackageName("@executioncontrolprotocol/secrets")).toBeUndefined()
    expect(inferredPackageName("@executioncontrolprotocol/process-env")).toBeUndefined()
    expect(inferredPackageName("@executioncontrolprotocol/registry-control")).toBeUndefined()
  })

  it("walks flow nodes when collecting capability ids", () => {
    const ids = collectCapabilityIds([
      {
        type: "parallel",
        id: "p",
        branches: [
          [{ id: "a", uses: "@executioncontrolprotocol/jsonata.transform" }],
          [{ id: "b", uses: "@acme/mail.send" }],
        ],
      },
    ])
    expect(ids).toEqual([
      "@executioncontrolprotocol/jsonata.transform",
      "@acme/mail.send",
    ])
  })
})
