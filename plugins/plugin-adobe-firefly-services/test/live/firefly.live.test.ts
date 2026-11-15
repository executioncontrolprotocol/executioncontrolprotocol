import { describe, expect, it } from "vitest"
import { generatedCapabilities } from "../../src/generated/index.js"
import { makeCtx } from "../helpers.js"

const clientId = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_ID
const clientSecret = process.env.ECP_SECRET_ADOBE_FIREFLY_CLIENT_SECRET
const scopes = process.env.ECP_SECRET_ADOBE_FIREFLY_SCOPES
const live = process.env.ECP_LIVE_FIREFLY === "1"

describe.skipIf(!live || !clientId || !clientSecret)("adobe firefly (live)", () => {
  it("generates one image and returns its output URL", async () => {
    const handler = (await generatedCapabilities["firefly-generate-images-v3-async"].handler()).default
    const ctx = makeCtx(
      { clientId, clientSecret, ...(scopes ? { scopes } : {}) },
      { signal: AbortSignal.timeout(300_000) },
    )

    const result = (await handler({ prompt: "A small red paper boat on calm water, studio light", numVariations: 1 }, ctx)) as {
      outputs: Array<{ image: { url: string } }>
    }

    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0]!.image.url).toMatch(/^https:\/\//)
  }, 300_000)
})
