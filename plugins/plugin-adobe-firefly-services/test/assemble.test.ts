import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  assembleAdobeOperationInput,
  ensureDefaultCaiClaimVersion,
  mergeParameterBody,
  liftManifestOutputContent,
  unwrapAdobeResult,
  withDefaultManifestOutputs,
} from "../src/runtime/assemble.js"
import { In_GenerateManifestRequest } from "../src/generated/photoshop/schemas.js"

const generateBody = z.strictObject({
  prompt: z.string().min(1),
  seeds: z.array(z.number().int()).optional(),
  numVariations: z.number().int().min(1).max(4).optional(),
  image: z.looseObject({}).optional(),
  caiClaimVersion: z.union([z.literal(1), z.literal(2)]).optional(),
})
const rules = { parameters: { body: ["prompt", "seeds", "numVariations", "image", "caiClaimVersion"] }, bodySchema: generateBody }

describe("mergeParameterBody", () => {
  it("lets set parameters replace body keys and keeps the rest", () => {
    expect(mergeParameterBody({ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 })).toEqual({ a: 1, b: { y: 2 }, c: 3 })
  })

  it("omits undefined parameters so they never wipe body keys", () => {
    expect(mergeParameterBody({ a: 1 }, { a: undefined })).toEqual({ a: 1 })
  })

  it("returns the parameters alone when there is no body, and the body alone when nothing is set", () => {
    expect(mergeParameterBody(undefined, { a: 1 })).toEqual({ a: 1 })
    expect(mergeParameterBody(["raw"], {})).toEqual(["raw"])
  })

  it("rejects a non-object body when parameters are set", () => {
    expect(() => mergeParameterBody(["x"], { a: 1 })).toThrow(
      expect.objectContaining({ code: "ECP_INPUT_INVALID", details: { issues: [{ path: "body", message: "Expected an object." }] } }),
    )
  })
})

describe("assembleAdobeOperationInput", () => {
  it("sends hoisted parameters alone as the JSON body", () => {
    expect(assembleAdobeOperationInput({ prompt: "sunset", numVariations: 2 }, rules).body).toEqual({
      prompt: "sunset",
      numVariations: 2,
    })
  })

  it("merges body under parameters: { ...body, ...set }", () => {
    const assembled = assembleAdobeOperationInput({ prompt: "from-param", body: { prompt: "from-body", seeds: [7] } }, rules)
    expect(assembled.body).toEqual({ prompt: "from-param", seeds: [7] })
  })

  it("keeps a body key when the matching parameter is omitted", () => {
    expect(assembleAdobeOperationInput({ body: { prompt: "keep", seeds: [2] } }, rules).body).toEqual({ prompt: "keep", seeds: [2] })
  })

  it("maps path, query and header keys and stringifies non-scalar values", () => {
    const assembled = assembleAdobeOperationInput(
      { jobId: "job-1", limit: 10, filter: { a: 1 }, "x-model-version": "image5", "x-flag": true, prompt: "dunes", stray: 1 },
      { parameters: { path: ["jobId"], query: ["limit", "filter"], headers: ["x-model-version", "x-flag"], body: ["prompt"] }, bodySchema: generateBody },
    )
    expect(assembled).toEqual({
      path: { jobId: "job-1" },
      query: { limit: 10, filter: '{"a":1}' },
      headers: { "x-model-version": "image5", "x-flag": "true" },
      body: { prompt: "dunes" },
    })
  })

  it("fails with issue paths when the merged body misses a required field", () => {
    expect(() => assembleAdobeOperationInput({ body: { seeds: [1] } }, rules)).toThrow(
      expect.objectContaining({
        code: "ECP_INPUT_INVALID",
        details: { issues: [expect.objectContaining({ path: "prompt" })] },
      }),
    )
  })

  it("rejects body keys the API schema does not declare", () => {
    expect(() => assembleAdobeOperationInput({ prompt: "x", body: { notAField: 1 } }, rules)).toThrow(
      expect.objectContaining({ code: "ECP_INPUT_INVALID" }),
    )
  })

  it("validates an empty body when the API requires one", () => {
    expect(() => assembleAdobeOperationInput({}, { ...rules, bodyRequired: true })).toThrow(
      expect.objectContaining({ code: "ECP_INPUT_INVALID" }),
    )
  })

  it("sends no body when nothing is set and none is required", () => {
    expect(assembleAdobeOperationInput({}, rules)).toEqual({ path: {}, query: {}, headers: {} })
    expect(assembleAdobeOperationInput({})).toEqual({ path: {}, query: {}, headers: {} })
  })

  it("passes a body through unchecked when the operation has no schema", () => {
    expect(assembleAdobeOperationInput({ body: [1, 2] }, {}).body).toEqual([1, 2])
  })

  it("defaults caiClaimVersion to 2 only when the operation asks for it", () => {
    const image = { source: { url: "https://example.test/a.png" } }
    expect(assembleAdobeOperationInput({ prompt: "p", image }, { ...rules, defaultCaiClaimVersion: true }).body).toEqual({
      prompt: "p",
      image,
      caiClaimVersion: 2,
    })
    expect(assembleAdobeOperationInput({ prompt: "p", image }, rules).body).toEqual({ prompt: "p", image })
  })

  it("never injects caiClaimVersion into the generated Photoshop manifest schema", () => {
    const assembled = assembleAdobeOperationInput(
      withDefaultManifestOutputs({ image: { source: { url: "https://example.test/a.psd" } } }),
      { parameters: { body: ["image", "outputs"] }, bodySchema: In_GenerateManifestRequest, bodyRequired: true },
    )
    expect(assembled.body).not.toHaveProperty("caiClaimVersion")
  })
})

describe("ensureDefaultCaiClaimVersion", () => {
  it("adds 2 for image inputs, keeps an explicit value and skips text-only bodies", () => {
    expect(ensureDefaultCaiClaimVersion({ mask: {} })).toEqual({ mask: {}, caiClaimVersion: 2 })
    expect(ensureDefaultCaiClaimVersion({ image: {}, caiClaimVersion: 1 })).toEqual({ image: {}, caiClaimVersion: 1 })
    expect(ensureDefaultCaiClaimVersion({ prompt: "x" })).toEqual({ prompt: "x" })
    expect(ensureDefaultCaiClaimVersion("raw")).toBe("raw")
  })
})

describe("unwrapAdobeResult", () => {
  it("returns the result object and drops the job envelope", () => {
    expect(unwrapAdobeResult({ jobId: "j", status: "succeeded", result: { outputs: [1] } })).toEqual({ outputs: [1] })
  })

  it("leaves bodies without a result object unchanged", () => {
    expect(unwrapAdobeResult({ status: "succeeded", outputs: [] })).toEqual({ status: "succeeded", outputs: [] })
    expect(unwrapAdobeResult({ result: [1] })).toEqual({ result: [1] })
    expect(unwrapAdobeResult({ result: null })).toEqual({ result: null })
    expect(unwrapAdobeResult([1])).toEqual([1])
    expect(unwrapAdobeResult(undefined)).toBeUndefined()
  })
})

describe("liftManifestOutputContent", () => {
  it("copies plain destination.content and leaves destination in place", () => {
    const payload = { outputs: [{ destination: { content: { layers: [] } } }] }
    expect(liftManifestOutputContent(payload)).toEqual({
      outputs: [{ destination: { content: { layers: [] } }, content: { layers: [] } }],
    })
  })

  it("leaves results without embedded destination content unchanged", () => {
    const bare = { outputs: [{ layers: [] }] }
    expect(liftManifestOutputContent(bare)).toEqual(bare)
  })

  it("parses JSON string content when embedded is json", () => {
    const payload = {
      outputs: [{ destination: { embedded: "json", content: '{"layers":[]}' } }],
    }
    expect(liftManifestOutputContent(payload)).toEqual({
      outputs: [{ destination: { embedded: "json", content: '{"layers":[]}' }, content: { layers: [] } }],
    })
  })

  it("keeps invalid JSON strings as text", () => {
    const payload = {
      outputs: [{ destination: { embedded: "json", content: "{not json" } }],
    }
    const lifted = liftManifestOutputContent(payload) as { outputs: Array<{ content: string }> }
    expect(lifted.outputs[0]?.content).toBe("{not json")
  })

  it("ignores non-object values", () => {
    expect(liftManifestOutputContent(null)).toBe(null)
    expect(liftManifestOutputContent({ outputs: [1, { destination: { content: 5 } }] })).toEqual({
      outputs: [1, { destination: { content: 5 } }],
    })
  })
})

describe("withDefaultManifestOutputs", () => {
  it("adds embedded JSON outputs when none are set", () => {
    expect(withDefaultManifestOutputs({ image: 1 })).toEqual({
      image: 1,
      outputs: [{ destination: { embedded: "json" }, mediaType: "application/json" }],
    })
    expect(withDefaultManifestOutputs({ outputs: [], body: { outputs: [] } }).outputs).toHaveLength(1)
  })

  it("keeps outputs set as a parameter or in body", () => {
    const param = { outputs: [{ mediaType: "image/png" }] }
    expect(withDefaultManifestOutputs(param)).toBe(param)
    const inBody = { body: { outputs: [{ mediaType: "image/png" }] } }
    expect(withDefaultManifestOutputs(inBody)).toBe(inBody)
  })
})
