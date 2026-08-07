import { describe, expect, it } from "vitest"
import {
  compileHarnessArtifactSource,
  extractArtifactFromModule,
} from "../../src/compile/compile-harness-artifact.js"
import { ECP_HARNESS_REPLY_SCHEMA, ECP_INTENT_SCHEMA } from "@executioncontrolprotocol/types"

const INTENT_TS = `
import type { EcpIntent } from "@executioncontrolprotocol/types"
export const intent: EcpIntent = {
  schema: "@executioncontrolprotocol.intent",
  intent: "faq",
}
`

const REPLY_TS = `
import type { HarnessReply } from "@executioncontrolprotocol/types"
export const reply: HarnessReply = {
  schema: "@executioncontrolprotocol.harness.reply",
  answer: "ECP governs portable workflows in governed environments.",
}
`

describe("compileHarnessArtifactSource", () => {
  it("compiles intent TypeScript module", async () => {
    const result = await compileHarnessArtifactSource({
      source: INTENT_TS,
      filename: "intent.ts",
      expectedSchema: ECP_INTENT_SCHEMA,
    })
    expect(result.ok).toBe(true)
    expect(result.artifact).toEqual({ schema: "@executioncontrolprotocol.intent", intent: "faq" })
  })

  it("compiles harness reply TypeScript module", async () => {
    const result = await compileHarnessArtifactSource({
      source: REPLY_TS,
      filename: "reply.ts",
      expectedSchema: ECP_HARNESS_REPLY_SCHEMA,
    })
    expect(result.ok).toBe(true)
    expect((result.artifact as { answer: string }).answer).toContain("ECP")
  })

  it("returns compileErrors for invalid module", async () => {
    const result = await compileHarnessArtifactSource({
      source: "export const x = 1",
      filename: "bad.ts",
      expectedSchema: ECP_INTENT_SCHEMA,
    })
    expect(result.ok).toBe(false)
    expect(result.compileErrors?.length).toBeGreaterThan(0)
  })
})

describe("extractArtifactFromModule", () => {
  it("reads default export", () => {
    const artifact = extractArtifactFromModule(
      { default: { schema: "@executioncontrolprotocol.intent", intent: "general" } },
      ECP_INTENT_SCHEMA
    )
    expect(artifact.intent).toBe("general")
  })
})
