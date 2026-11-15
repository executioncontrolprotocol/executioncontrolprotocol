import { describe, expect, it } from "vitest"
import type { ArtifactFileRef, HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import generate from "../src/capabilities/generate.js"

const apiKey = process.env.ECP_SECRET_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
const live = process.env.ECP_LIVE_ANTHROPIC === "1"

describe.skipIf(!live || !apiKey)("anthropic generate (live)", () => {
  it("returns text and token usage from the real API", async () => {
    const ctx: HandlerContext = {
      config: { apiKey, model: "claude-sonnet-4-5" },
      signal: AbortSignal.timeout(60_000),
      run: { id: "live" },
      step: { id: "live" },
      state: {},
      store: { set() {}, merge() {}, append() {} },
      files: {
        async read() {
          return { bytes: new Uint8Array() }
        },
        async writeArtifact(): Promise<ArtifactFileRef> {
          return { kind: "artifact", uri: "ecp://runs/live/artifacts/x" }
        },
      },
      async call() {
        return undefined
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      usage: { record() {} },
    }

    const result = await generate({ prompt: "Reply with the single word: ready", maxTokens: 16 }, ctx)

    expect(result.text.length).toBeGreaterThan(0)
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  }, 60_000)
})
